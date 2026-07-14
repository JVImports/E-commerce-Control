(function () {
  'use strict';

  var FUNCTION_SLUG = 'mavis-integrations-v1';
  var state = { account: null, integrations: [], loading: false, error: '' };

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function client() { return window.supabaseClient || null; }
  function endpoint() {
    return String((window.MAVIS_RUNTIME_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '') +
      '/functions/v1/' + FUNCTION_SLUG;
  }
  function dateLabel(value) {
    if (!value) return 'Ainda não informado';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Ainda não informado' :
      new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }
  function statusLabel(status) {
    return { active: 'Ativa', healthy: 'Saudável', warning: 'Atenção', error: 'Indisponível' }[status] || 'Em acompanhamento';
  }
  async function requestBootstrap() {
    var api = client();
    if (!api || !api.auth) throw new Error('Sua sessão expirou. Entre novamente.');
    var result = await api.auth.getSession();
    var session = result && result.data && result.data.session;
    if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
    var response = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'bootstrap' })
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(response.status === 403 ? 'Este acesso não possui permissão para consultar as integrações.' : 'Não foi possível carregar as integrações agora.');
    return body;
  }
  function moduleMarkup(module) {
    return '<li><span>' + escapeHtml(module.label || module.key) + '</span>' +
      '<strong>' + escapeHtml(String(module.records == null ? 0 : module.records)) + ' registros</strong>' +
      '<small>' + escapeHtml(statusLabel(module.status)) + ' · ' + escapeHtml(dateLabel(module.last_sync_at)) + '</small></li>';
  }
  function integrationMarkup(integration) {
    var shops = (integration.shops || []).map(function (shop) {
      return '<span class="mavis-shop-pill">' + escapeHtml(shop.name || 'Loja conectada') + ' · ' + escapeHtml(statusLabel(shop.status)) + '</span>';
    }).join('');
    return '<article class="mavis-integration-card">' +
      '<header><div><span class="mavis-provider">' + escapeHtml(integration.display_name || integration.provider) + '</span>' +
      '<h3>' + escapeHtml(integration.provider === 'upseller' ? 'Importação de dados UPSeller' : 'Canal Shopee conectado') + '</h3></div>' +
      '<span class="mavis-status is-' + escapeHtml(integration.status) + '">' + escapeHtml(statusLabel(integration.status)) + '</span></header>' +
      '<p>Última atualização: <strong>' + escapeHtml(dateLabel(integration.last_sync_at)) + '</strong></p>' +
      (shops ? '<div class="mavis-shop-list">' + shops + '</div>' : '') +
      '<ul class="mavis-module-list">' + (integration.modules || []).map(moduleMarkup).join('') + '</ul>' +
      '</article>';
  }
  function render() {
    var target = byId('mavis-integrations-content');
    var account = byId('mavis-integrations-account');
    if (!target) return;
    if (account) account.textContent = state.account ? state.account.name + ' · acesso ' + String(state.account.role || '').toLowerCase() : '';
    if (state.loading) return void (target.innerHTML = '<div class="mavis-integration-empty">Carregando conexões...</div>');
    if (state.error) return void (target.innerHTML = '<div class="mavis-integration-empty is-error">' + escapeHtml(state.error) + '</div>');
    target.innerHTML = state.integrations.length ? state.integrations.map(integrationMarkup).join('') :
      '<div class="mavis-integration-empty">Nenhuma integração disponível para esta empresa.</div>';
  }
  async function refresh() {
    state.loading = true; state.error = ''; render();
    try {
      var data = await requestBootstrap();
      state.account = data.account || null;
      state.integrations = Array.isArray(data.integrations) ? data.integrations : [];
    } catch (error) { state.error = error.message; }
    finally { state.loading = false; render(); }
  }
  function install() {
    var view = byId('shopee-sync-view');
    if (!view) return;
    view.innerHTML = '<section class="mavis-integrations"><div class="mavis-integrations-heading"><div><h2>Integrações</h2>' +
      '<p>Acompanhe a disponibilidade dos canais e a atualização dos dados usados pelo Mavis.</p></div>' +
      '<span id="mavis-integrations-account"></span></div><div id="mavis-integrations-content"></div></section>';
    window.addEventListener('mavis:auth-restored', refresh);
    window.addEventListener('mavis:auth-changed', refresh);
    if (view.classList.contains('active')) refresh();
  }
  window.mavisIntegrations = { state: state, install: install, refresh: refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
