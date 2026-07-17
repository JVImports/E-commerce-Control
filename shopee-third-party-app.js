(function () {
  'use strict';

  var FUNCTIONS = {
    integrations: 'mavis-integrations-v1',
    oauth: 'shopee-oauth-v3',
    sync: 'shopee-sync-v3'
  };
  var state = {
    account: null,
    integrations: [],
    oauth: { configured: false, environment: '', connections: [] },
    loading: false,
    busy: '',
    error: '',
    notice: ''
  };

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function client() { return window.supabaseClient || null; }
  function endpoint(slug) {
    return String((window.MAVIS_RUNTIME_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '') +
      '/functions/v1/' + slug;
  }
  function dateLabel(value) {
    if (!value) return 'Ainda não sincronizado';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Ainda não sincronizado' :
      new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }
  function statusLabel(status) {
    return {
      active: 'Ativa', healthy: 'Saudável', warning: 'Atenção', error: 'Indisponível',
      inactive: 'Inativa', empty: 'Sem dados', revoked: 'Desconectada',
      legacy_pending_reauth: 'Reautorização necessária'
    }[status] || 'Em acompanhamento';
  }
  function manager() {
    return Boolean(state.account && ['owner', 'admin'].includes(String(state.account.role || '').toLowerCase()));
  }
  async function sessionToken() {
    var api = client();
    if (!api || !api.auth) throw new Error('Sua sessão expirou. Entre novamente.');
    var result = await api.auth.getSession();
    var session = result && result.data && result.data.session;
    if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
    return session.access_token;
  }
  async function invoke(slug, payload) {
    var response = await fetch(endpoint(slug), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await sessionToken() },
      body: JSON.stringify(payload || {})
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || body.ok === false) {
      throw new Error(body.error || body.message || 'Não foi possível concluir a operação.');
    }
    return body;
  }
  function moduleMarkup(module) {
    return '<li><span>' + escapeHtml(module.label || module.key) + '</span>' +
      '<strong>' + escapeHtml(String(module.records == null ? 0 : module.records)) + ' registros</strong>' +
      '<small>' + escapeHtml(statusLabel(module.status)) + ' · ' + escapeHtml(dateLabel(module.last_sync_at)) + '</small></li>';
  }
  function connectionForShop(shop) {
    return (state.oauth.connections || []).find(function (connection) {
      return String(connection.external_shop_id) === String(shop.shop_id);
    }) || null;
  }
  function button(label, action, options) {
    var disabled = state.busy || (options && options.disabled);
    var attrs = ' type="button" class="' + ((options && options.secondary) ? 'mavis-action-secondary' : 'mavis-action-primary') +
      '" data-mavis-action="' + escapeHtml(action) + '"';
    if (options && options.connectionId) attrs += ' data-connection-id="' + escapeHtml(options.connectionId) + '"';
    if (options && options.syncAction) attrs += ' data-sync-action="' + escapeHtml(options.syncAction) + '"';
    if (disabled) attrs += ' disabled';
    return '<button' + attrs + '>' + escapeHtml(state.busy === action ? 'Processando…' : label) + '</button>';
  }
  function controlsMarkup(integration) {
    if (!manager()) return '<p class="mavis-readonly-note">Seu perfil possui acesso somente leitura.</p>';
    var connections = state.oauth.connections || [];
    var active = connections.filter(function (connection) { return connection.status === 'active'; });
    var needsAuth = connections.some(function (connection) { return connection.status === 'legacy_pending_reauth'; });
    var sandbox = state.oauth.environment === 'sandbox';
    var connectLabel = sandbox ? (needsAuth ? 'Reautorizar loja de teste' : 'Autorizar loja de teste Shopee') :
      (needsAuth ? 'Reautorizar com a Shopee' : 'Conectar loja Shopee');
    var connect = button(connectLabel, 'connect', { disabled: !state.oauth.configured });
    var hint = state.oauth.configured ? (sandbox ?
      'Ambiente Sandbox: use somente uma conta de teste da Shopee; lojas e dados reais não são aceitos.' :
      'A autorização acontece diretamente na Shopee. O Mavix Hub não recebe sua senha.') :
      'A conexão está em liberação controlada. Nenhuma credencial foi exposta.';
    var activeControls = active.map(function (connection) {
      return '<div class="mavis-connection-controls"><strong>' + escapeHtml(connection.shop_name || ('Loja ' + connection.external_shop_id)) + '</strong>' +
        '<div class="mavis-action-row">' +
        button('Catálogo', 'sync', { connectionId: connection.id, syncAction: 'sync-catalog', secondary: true }) +
        button('Pedidos', 'sync', { connectionId: connection.id, syncAction: 'sync-orders-batch', secondary: true }) +
        button('Financeiro', 'sync', { connectionId: connection.id, syncAction: 'sync-financial', secondary: true }) +
        button('Ads', 'sync', { connectionId: connection.id, syncAction: 'sync-product-ads', secondary: true }) +
        button('Desconectar', 'disconnect', { connectionId: connection.id, secondary: true }) +
        '</div></div>';
    }).join('');
    return '<div class="mavis-oauth-controls"><div class="mavis-action-row">' + connect + '</div>' +
      '<small>' + escapeHtml(hint) + '</small>' + activeControls + '</div>';
  }
  function shopeeMarkup(integration) {
    var sandbox = state.oauth.environment === 'sandbox';
    var shops = (integration.shops || []).map(function (shop) {
      var connection = connectionForShop(shop);
      var status = connection ? connection.status : shop.status;
      return '<span class="mavis-shop-pill">' + escapeHtml(shop.name || 'Loja conectada') + ' · ' +
        escapeHtml(statusLabel(status)) + '</span>';
    }).join('');
    return '<article class="mavis-integration-card mavis-shopee-card"><header><div><span class="mavis-provider">Shopee Open Platform' + (sandbox ? ' · Sandbox' : '') + '</span>' +
      '<h3>' + (sandbox ? 'Validação oficial via OAuth' : 'Conexão oficial via OAuth') + '</h3></div><span class="mavis-status is-' + escapeHtml(integration.status) + '">' +
      escapeHtml(statusLabel(integration.status)) + '</span></header>' +
      '<p>Última atualização: <strong>' + escapeHtml(dateLabel(integration.last_sync_at)) + '</strong></p>' +
      (shops ? '<div class="mavis-shop-list">' + shops + '</div>' : '<p class="mavis-muted">Nenhuma loja autorizada ainda.</p>') +
      '<ul class="mavis-module-list">' + (integration.modules || []).map(moduleMarkup).join('') + '</ul>' +
      controlsMarkup(integration) + '</article>';
  }
  function genericMarkup(integration) {
    return '<article class="mavis-integration-card"><header><div><span class="mavis-provider">' +
      escapeHtml(integration.display_name || integration.provider) + '</span><h3>Importação operacional controlada</h3></div>' +
      '<span class="mavis-status is-' + escapeHtml(integration.status) + '">' + escapeHtml(statusLabel(integration.status)) +
      '</span></header><p>Última atualização: <strong>' + escapeHtml(dateLabel(integration.last_sync_at)) + '</strong></p>' +
      '<ul class="mavis-module-list">' + (integration.modules || []).map(moduleMarkup).join('') + '</ul></article>';
  }
  function render() {
    var target = byId('mavis-integrations-content');
    var account = byId('mavis-integrations-account');
    if (!target) return;
    if (account) account.textContent = state.account ? state.account.name + ' · acesso ' + String(state.account.role || '').toLowerCase() : '';
    if (state.loading) return void (target.innerHTML = '<div class="mavis-integration-empty">Carregando conexões…</div>');
    var alert = '';
    if (state.error) alert = '<div class="mavis-integration-alert is-error">' + escapeHtml(state.error) + '</div>';
    else if (state.notice) alert = '<div class="mavis-integration-alert is-success">' + escapeHtml(state.notice) + '</div>';
    target.innerHTML = alert + (state.integrations.length ? state.integrations.map(function (integration) {
      return integration.provider === 'shopee' ? shopeeMarkup(integration) : genericMarkup(integration);
    }).join('') : '<div class="mavis-integration-empty">Nenhuma integração disponível para esta empresa.</div>');
  }
  function readCallback() {
    var params = new URLSearchParams(window.location.search);
    var result = params.get('shopee_connection');
    if (!result) return;
    state.notice = result === 'success' ? 'Loja Shopee autorizada com sucesso.' : '';
    state.error = result === 'error' ? 'A Shopee não concluiu a autorização. Tente novamente.' : '';
    params.delete('shopee_connection'); params.delete('shopee_code'); params.delete('shop_id');
    var query = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
  }
  async function refresh() {
    state.loading = true; state.error = ''; render();
    try {
      var data = await invoke(FUNCTIONS.integrations, { action: 'bootstrap' });
      state.account = data.account || null;
      state.integrations = Array.isArray(data.integrations) ? data.integrations : [];
      var oauth = await invoke(FUNCTIONS.oauth, { action: 'bootstrap' });
      state.oauth = { configured: Boolean(oauth.configured), environment: String(oauth.environment || ''), connections: Array.isArray(oauth.connections) ? oauth.connections : [] };
    } catch (error) { state.error = error.message; }
    finally { state.loading = false; render(); }
  }
  async function connectShopee() {
    if (!state.account) throw new Error('Selecione uma empresa antes de conectar a Shopee.');
    var result = await invoke(FUNCTIONS.oauth, {
      action: 'start', account_id: state.account.id, return_path: '/?review=shopee'
    });
    if (!result.authorization_url) throw new Error('A Shopee não retornou a URL de autorização.');
    window.location.assign(result.authorization_url);
  }
  async function runSync(button) {
    var connectionId = button.getAttribute('data-connection-id');
    var syncAction = button.getAttribute('data-sync-action');
    var payload = { action: syncAction, account_id: state.account.id, connection_id: connectionId };
    if (syncAction === 'sync-orders-batch') payload.months = 3;
    if (syncAction === 'sync-financial') payload.months = 1;
    if (syncAction === 'sync-product-ads') payload.days = 30;
    await invoke(FUNCTIONS.sync, payload);
    state.notice = 'Sincronização concluída com sucesso.';
    if (typeof window.loadAllData === 'function') window.setTimeout(function () { window.loadAllData(); }, 300);
  }
  async function disconnect(button) {
    if (!window.confirm('Desconectar esta loja da Shopee? As informações já importadas serão preservadas.')) return;
    await invoke(FUNCTIONS.oauth, {
      action: 'disconnect', account_id: state.account.id,
      connection_id: button.getAttribute('data-connection-id')
    });
    state.notice = 'Loja desconectada com segurança.';
  }
  async function onClick(event) {
    var button = event.target.closest('[data-mavis-action]');
    if (!button || state.busy) return;
    var action = button.getAttribute('data-mavis-action');
    state.busy = action; state.error = ''; state.notice = ''; render();
    try {
      if (action === 'connect') return await connectShopee();
      if (action === 'sync') await runSync(button);
      if (action === 'disconnect') await disconnect(button);
      await refresh();
    } catch (error) {
      state.error = error.message;
    } finally {
      state.busy = ''; render();
    }
  }
  function install() {
    var view = byId('shopee-sync-view');
    if (!view || view.dataset.mavisIntegrationsInstalled === 'true') return;
    view.dataset.mavisIntegrationsInstalled = 'true';
    view.innerHTML = '<section class="mavis-integrations"><div class="mavis-integrations-heading"><div><h2>Integrações</h2>' +
      '<p>Conecte seus canais e acompanhe a atualização dos dados usados pelo Mavix Hub.</p></div>' +
      '<span id="mavis-integrations-account"></span></div><div id="mavis-integrations-content"></div></section>';
    view.addEventListener('click', onClick);
    readCallback();
    window.addEventListener('mavis:auth-restored', refresh);
    window.addEventListener('mavis:auth-changed', refresh);
    if (view.classList.contains('active')) refresh();
  }

  window.mavisIntegrations = { state: state, install: install, refresh: refresh };
  window.jvShopeeThirdParty = window.mavisIntegrations;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
