(function () {
  'use strict';

  var VERSION = '20260710-third-party-v3';
  var FUNCTION_SLUG = 'shopee-oauth-v3';
  var state = { accounts: [], connections: [], configured: false, busy: false };

  function byId(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function getClient() {
    try { if (supabaseClient) return supabaseClient; } catch (e) {}
    return window.supabaseClient || null;
  }

  function getSupabaseUrl() {
    try { if (supabaseUrl) return String(supabaseUrl); } catch (e) {}
    return localStorage.getItem('supabase_url') || '';
  }

  async function request(action, payload) {
    var client = getClient();
    if (!client || !client.auth) throw new Error('Supabase não conectado.');
    var sessionResult = await client.auth.getSession();
    var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
    if (!session) throw new Error('Entre novamente para gerenciar lojas Shopee.');
    var base = getSupabaseUrl().replace(/\/+$/, '');
    var response = await fetch(base + '/functions/v1/' + FUNCTION_SLUG, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var text = await response.text();
    var data = text ? JSON.parse(text) : {};
    if (!response.ok || data.ok === false) {
      if (response.status === 404) throw new Error('Backend OAuth v3 preparado, mas ainda não implantado.');
      throw new Error(data.error || ('HTTP ' + response.status));
    }
    return data;
  }

  function setStatus(message, type) {
    var el = byId('jv-third-party-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'jv-third-party-status ' + (type || 'info');
  }

  function statusLabel(connection) {
    var labels = {
      active: 'Conectada',
      pending: 'Pendente',
      reauthorization_required: 'Reconectar',
      revoked: 'Revogada',
      error: 'Erro'
    };
    return labels[connection.status] || connection.status;
  }

  function render() {
    var account = byId('jv-third-party-account');
    if (account) {
      var current = account.value;
      account.innerHTML = state.accounts.map(function (row) {
        return '<option value="' + escapeHtml(row.id) + '">' +
          escapeHtml(row.name + ' · ' + String(row.role || '').toUpperCase()) + '</option>';
      }).join('');
      if (state.accounts.some(function (row) { return String(row.id) === String(current); })) account.value = current;
    }

    var badge = byId('jv-third-party-config-badge');
    if (badge) {
      badge.textContent = state.configured ? 'App third-party configurado' : 'Aguardando aprovação da Shopee';
      badge.className = 'jv-third-party-badge ' + (state.configured ? 'ok' : 'waiting');
    }

    var list = byId('jv-third-party-connections');
    if (list) {
      var selectedAccount = account ? account.value : '';
      var rows = state.connections.filter(function (row) {
        return !selectedAccount || String(row.account_id) === String(selectedAccount);
      });
      list.innerHTML = rows.length ? rows.map(function (row) {
        return '<div class="jv-third-party-connection">' +
          '<div><strong>' + escapeHtml(row.shop_name || ('Shopee ' + row.external_shop_id)) + '</strong>' +
          '<span>Shop ID ' + escapeHtml(row.external_shop_id) + '</span></div>' +
          '<div class="jv-third-party-connection-actions">' +
          '<span class="jv-third-party-badge ' + (row.status === 'active' ? 'ok' : 'waiting') + '">' +
          escapeHtml(statusLabel(row)) + '</span>' +
          (row.status !== 'revoked' ? '<button type="button" data-disconnect="' + escapeHtml(row.id) + '">Desvincular</button>' : '') +
          '</div></div>';
      }).join('') : '<div class="jv-third-party-empty">Nenhuma loja autorizada nesta conta.</div>';
    }

    var connect = byId('jv-third-party-connect');
    if (connect) connect.disabled = state.busy || !state.configured || !state.accounts.length;
    window.dispatchEvent(new CustomEvent('jv:shopee-connections', {
      detail: { accounts: state.accounts, connections: state.connections, configured: state.configured }
    }));
  }

  async function refresh(options) {
    try {
      var data = await request('bootstrap');
      state.accounts = data.accounts || [];
      state.connections = data.connections || [];
      state.configured = data.configured === true;
      render();
      if (!options || !options.silent) {
        setStatus(state.configured ? 'Integração pronta para autorizar lojas.' : 'Estrutura pronta; aguardando Partner ID/Key do app aprovado.', state.configured ? 'ok' : 'info');
      }
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function connect() {
    var account = byId('jv-third-party-account');
    if (!account || !account.value) return setStatus('Selecione uma conta.', 'error');
    state.busy = true;
    render();
    setStatus('Gerando autorização segura...', 'info');
    try {
      var data = await request('start', {
        account_id: account.value,
        return_path: window.location.pathname || '/'
      });
      window.location.assign(data.authorization_url);
    } catch (error) {
      state.busy = false;
      render();
      setStatus(error.message, 'error');
    }
  }

  async function disconnect(connectionId) {
    var account = byId('jv-third-party-account');
    if (!account || !account.value) return;
    if (!window.confirm('Desvincular esta loja do sistema?')) return;
    try {
      await request('disconnect', { account_id: account.value, connection_id: connectionId });
      setStatus('Loja desvinculada localmente.', 'ok');
      await refresh({ silent: true });
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function callbackFeedback() {
    var url = new URL(window.location.href);
    var result = url.searchParams.get('shopee_connection');
    if (!result) return;
    var code = url.searchParams.get('shopee_code') || '';
    if (result === 'success') setStatus('Loja autorizada. A primeira sincronização poderá ser iniciada.', 'ok');
    else setStatus('A autorização não foi concluída: ' + code + '.', 'error');
    ['shopee_connection', 'shopee_code', 'shop_id'].forEach(function (key) { url.searchParams.delete(key); });
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }

  function install() {
    var view = byId('shopee-sync-view');
    if (!view || byId('shopee-third-party-panel')) return;
    var legacy = byId('shopee-multi-app-panel');
    if (legacy) legacy.remove();

    var panel = document.createElement('div');
    panel.id = 'shopee-third-party-panel';
    panel.className = 'panel-card jv-third-party-panel';
    panel.innerHTML = [
      '<div class="jv-third-party-head"><div><h3>Conectar loja Shopee</h3>',
      '<p>Um único app parceiro autoriza lojas por OAuth. Nenhum Partner Key é informado no navegador.</p></div>',
      '<span id="jv-third-party-config-badge" class="jv-third-party-badge waiting">Verificando...</span></div>',
      '<div class="jv-third-party-controls"><label><span>Conta do sistema</span>',
      '<select id="jv-third-party-account"></select></label>',
      '<button id="jv-third-party-connect" class="btn-primary" type="button">Autorizar nova loja</button></div>',
      '<div id="jv-third-party-status" class="jv-third-party-status info"></div>',
      '<div id="jv-third-party-connections" class="jv-third-party-connections"></div>'
    ].join('');
    view.insertBefore(panel, view.firstChild);

    byId('jv-third-party-connect').addEventListener('click', connect);
    byId('jv-third-party-account').addEventListener('change', render);
    byId('jv-third-party-connections').addEventListener('click', function (event) {
      var button = event.target.closest('[data-disconnect]');
      if (button) disconnect(button.getAttribute('data-disconnect'));
    });
    callbackFeedback();
    refresh({ silent: true });
  }

  window.jvShopeeThirdParty = {
    version: VERSION,
    state: state,
    refresh: refresh,
    request: request,
    install: install
  };

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

