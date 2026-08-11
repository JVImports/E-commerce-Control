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
    notice: '',
    catalogOpen: false
  };
  var SYNC_LABELS = {
    'sync-catalog': 'Catálogo',
    'sync-orders-batch': 'Pedidos',
    'sync-financial': 'Financeiro'
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
  function connectionName(connection, connections) {
    var base = String(connection.shop_name || '').trim();
    var generic = !base || /^loja principal$/i.test(base) || /^loja conectada$/i.test(base);
    var duplicate = base && (connections || []).filter(function (item) {
      return String(item.shop_name || '').trim().toLowerCase() === base.toLowerCase();
    }).length > 1;
    return generic || duplicate ? 'Shopee · Loja ' + connection.external_shop_id : base;
  }
  function shopForConnection(integration, connection) {
    return (integration.shops || []).find(function (shop) {
      return String(shop.shop_id) === String(connection.external_shop_id);
    }) || null;
  }
  function shopRecordCount(shop) {
    return (shop && shop.modules || []).reduce(function (total, module) {
      return total + Number(module.records || 0);
    }, 0);
  }
  function publishConnections() {
    window.dispatchEvent(new CustomEvent('mavis:shop-connections-updated', {
      detail: {
        environment: state.oauth.environment,
        connections: (state.oauth.connections || []).map(function (connection) {
          return {
            id: connection.id,
            shop_id: connection.external_shop_id,
            shop_name: connectionName(connection, state.oauth.connections),
            status: connection.status,
            last_sync_at: connection.last_sync_at || null
          };
        })
      }
    }));
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
    var buttonClass = (options && options.secondary) ? 'mavis-action-secondary' : 'mavis-action-primary';
    if (options && options.danger) buttonClass += ' mavis-action-danger';
    var attrs = ' type="button" class="' + buttonClass +
      '" data-mavis-action="' + escapeHtml(action) + '"';
    if (options && options.connectionId) attrs += ' data-connection-id="' + escapeHtml(options.connectionId) + '"';
    if (options && options.syncAction) attrs += ' data-sync-action="' + escapeHtml(options.syncAction) + '"';
    if (disabled) attrs += ' disabled';
    return '<button' + attrs + '>' + escapeHtml(state.busy === action ? 'Processando…' : label) + '</button>';
  }
  function connectionMarkup(connection, integration) {
    var shop = shopForConnection(integration, connection);
    var name = connectionName(connection, state.oauth.connections);
    var active = connection.status === 'active';
    var pending = connection.status === 'legacy_pending_reauth';
    var records = shopRecordCount(shop);
    var description = active && !connection.last_sync_at ?
      'Pronta para a primeira sincronização. Escolha um módulo abaixo para importar os dados desta loja.' :
      active ? 'Conexão OAuth ativa. Catálogo, pedidos e financeiro atualizam automaticamente; Ads entra por relatório.' :
      pending ?
        'Dados históricos preservados. Reautorize esta loja para voltar a atualizar.' :
        'Esta conexão não está atualizando dados no momento.';
    var actions = '';
    if (manager() && active) {
      actions = '<div class="mavis-action-row">' +
        button('Catálogo', 'sync', { connectionId: connection.id, syncAction: 'sync-catalog', secondary: true }) +
        button('Pedidos', 'sync', { connectionId: connection.id, syncAction: 'sync-orders-batch', secondary: true }) +
        button('Financeiro', 'sync', { connectionId: connection.id, syncAction: 'sync-financial', secondary: true }) +
        button('Importar relatório Ads', 'open-ads-import', { secondary: true }) +
        button('Desconectar', 'disconnect', { connectionId: connection.id, secondary: true, danger: true }) +
        '</div>';
    } else if (manager() && pending) {
      actions = '<div class="mavis-action-row">' +
        button('Reautorizar pela Shopee', 'connect', { disabled: !state.oauth.configured }) +
        '</div>';
    }
    return '<section class="mavis-store-row is-' + escapeHtml(connection.status) + '">' +
      '<div class="mavis-store-icon">S</div><div class="mavis-store-body"><div class="mavis-store-title">' +
      '<div><strong>' + escapeHtml(name) + '</strong><span>ID Shopee ' + escapeHtml(connection.external_shop_id) + '</span></div>' +
      '<span class="mavis-status is-' + escapeHtml(active ? 'active' : pending ? 'warning' : connection.status) + '">' +
      escapeHtml(statusLabel(connection.status)) + '</span></div>' +
      '<p>' + escapeHtml(description) + '</p><div class="mavis-store-meta"><span>' +
      escapeHtml(String(records)) + ' registros nos módulos</span><span>Última atualização: ' +
      escapeHtml(dateLabel(connection.last_sync_at || (shop && shop.last_sync_at))) + '</span></div>' +
      actions + '</div></section>';
  }
  function controlsMarkup(integration) {
    if (!manager()) return '<p class="mavis-readonly-note">Seu perfil possui acesso somente leitura.</p>';
    var connections = state.oauth.connections || [];
    var needsAuth = connections.some(function (connection) { return connection.status === 'legacy_pending_reauth'; });
    var sandbox = state.oauth.environment === 'sandbox';
    var connectLabel = sandbox ? 'Adicionar loja de teste' :
      (needsAuth ? 'Adicionar ou reautorizar loja' : 'Adicionar outra loja Shopee');
    var hint = state.oauth.configured ? (sandbox ?
      'Ambiente Sandbox: use somente uma conta de teste da Shopee; lojas e dados reais não são aceitos.' :
      'A autorização acontece diretamente na Shopee. O Mavix Hub não recebe sua senha.') :
      'A conexão está em liberação controlada. Nenhuma credencial foi exposta.';
    return '<div class="mavis-oauth-controls"><div class="mavis-action-row">' +
      button(connectLabel, 'connect', { disabled: !state.oauth.configured }) + '</div>' +
      '<small>' + escapeHtml(hint) + '</small></div>';
  }
  function shopeeMarkup(integration) {
    var sandbox = state.oauth.environment === 'sandbox';
    var connections = state.oauth.connections || [];
    var activeCount = connections.filter(function (connection) { return connection.status === 'active'; }).length;
    var pendingCount = connections.filter(function (connection) { return connection.status === 'legacy_pending_reauth'; }).length;
    var summary = activeCount + ' ativa' + (activeCount === 1 ? '' : 's');
    if (pendingCount) summary += ' · ' + pendingCount + ' aguardando reautorização';
    return '<article class="mavis-integration-card mavis-shopee-card"><header><div><span class="mavis-provider">Shopee Open Platform' + (sandbox ? ' · Sandbox' : '') + '</span>' +
      '<h3>' + (sandbox ? 'Validação oficial via OAuth' : 'Conexão oficial via OAuth') + '</h3></div><span class="mavis-status is-' + escapeHtml(integration.status) + '">' +
      escapeHtml(statusLabel(integration.status)) + '</span></header>' +
      '<p class="mavis-channel-summary">' + escapeHtml(summary) + '</p>' +
      (connections.length ? '<div class="mavis-store-list">' + connections.map(function (connection) {
        return connectionMarkup(connection, integration);
      }).join('') + '</div>' : '<p class="mavis-muted">Nenhuma loja autorizada ainda.</p>') +
      controlsMarkup(integration) + '</article>';
  }
  function catalogMarkup() {
    if (!state.catalogOpen) return '';
    return '<section class="mavis-channel-picker"><div class="mavis-channel-picker-title"><div><span class="mavis-provider">Novo canal</span>' +
      '<h3>Escolha o marketplace ou fonte de dados</h3></div>' +
      button('Fechar', 'toggle-catalog', { secondary: true }) + '</div><div class="mavis-channel-options">' +
      '<article><div class="mavis-channel-logo is-shopee">S</div><div><strong>Shopee</strong><span>OAuth oficial · disponível</span></div>' +
      button('Conectar loja', 'connect', { disabled: !state.oauth.configured }) + '</article>' +
      '<article><div class="mavis-channel-logo is-upseller">U</div><div><strong>UPSeller</strong><span>Importação XLSX/CSV · disponível</span></div>' +
      button('Importar dados', 'open-importer', { secondary: true }) + '</article>' +
      '<article class="is-coming"><div class="mavis-channel-logo">M</div><div><strong>Mercado Livre</strong><span>Em preparação</span></div></article>' +
      '<article class="is-coming"><div class="mavis-channel-logo">A</div><div><strong>Amazon</strong><span>Em preparação</span></div></article>' +
      '</div></section>';
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
    target.innerHTML = alert + catalogMarkup() + (state.integrations.length ? state.integrations.map(function (integration) {
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
      publishConnections();
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
    await invoke(FUNCTIONS.sync, payload);
    var connection = (state.oauth.connections || []).find(function (item) { return item.id === connectionId; });
    var shopName = connection ? connectionName(connection, state.oauth.connections) : 'a loja selecionada';
    state.notice = (SYNC_LABELS[syncAction] || 'Sincronização') + ' concluído para ' + shopName + '.';
    if (typeof window.loadAllData === 'function') window.setTimeout(function () { window.loadAllData(); }, 300);
  }
  function openAdsImport() {
    if (typeof window.switchView === 'function') window.switchView('anuncios');
    window.setTimeout(function () {
      var panel = byId('jv-ads-import-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
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
    if (action === 'toggle-catalog') {
      state.catalogOpen = !state.catalogOpen;
      render();
      return;
    }
    if (action === 'open-importer') {
      if (typeof window.switchView === 'function') window.switchView('importer');
      return;
    }
    if (action === 'open-ads-import') {
      openAdsImport();
      return;
    }
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
    view.innerHTML = '<section class="mavis-integrations"><div class="mavis-integrations-heading"><div><h2>Marketplaces e lojas</h2>' +
      '<p>Conecte canais, escolha cada loja e acompanhe de onde vêm os dados do Mavix Hub.</p></div><div class="mavis-integrations-heading-actions">' +
      '<span id="mavis-integrations-account"></span>' + button('Adicionar canal', 'toggle-catalog', { secondary: true }) +
      '</div></div><div id="mavis-integrations-content"></div></section>';
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
