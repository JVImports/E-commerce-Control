// JV Imports Ads Analyzer v2: real Shopee product Ads + account finance settings.
(function () {
  const PRODUCT_ADS_FUNCTION = 'shopee-sync-product-ads';
  const DEFAULT_FINANCE = {
    commission_percent: 14,
    fixed_fee_amount: 4,
    service_fee_percent: 0,
    tax_percent: 0
  };

  const state = {
    currentModal: null,
    financeSettings: null,
    lastProductContext: null
  };

  function install() {
    installConfigPanel();
    installTableInterceptor();
    patchAnalyzerOpen();
  }

  function patchAnalyzerOpen() {
    window.openProductOptimizer = openProductAnalyzerV2;
    if (window.jvAdsAnalyzer) window.jvAdsAnalyzer.open = openProductAnalyzerV2;
  }

  function installTableInterceptor() {
    const table = document.getElementById('table-listings');
    if (!table || table.dataset.productAdsV2 === 'true') return;
    table.dataset.productAdsV2 = 'true';
    table.addEventListener('click', function (event) {
      const row = event.target && event.target.closest ? event.target.closest('tr[data-item-id]') : null;
      if (!row) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      openProductAnalyzerV2(row.getAttribute('data-item-id'));
    }, true);
  }

  function installConfigPanel() {
    const configView = document.getElementById('config-view');
    if (!configView || document.getElementById('commerce-finance-settings-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'commerce-finance-settings-panel';
    panel.className = 'panel-card commerce-settings-panel';
    panel.innerHTML = [
      '<div class="ads-section-title"><h4>Configurações Financeiras Comerciais</h4><span>Salvas por conta no Supabase</span></div>',
      '<div class="commerce-settings-grid">',
      financeSettingInput('cfg-commission', 'Comissão Shopee %'),
      financeSettingInput('cfg-fixed-fee', 'Taxa fixa Shopee R$'),
      financeSettingInput('cfg-service-fee', 'Taxa de serviço %'),
      financeSettingInput('cfg-tax', 'Imposto %'),
      '</div>',
      '<div class="commerce-settings-actions">',
      '<button id="cfg-save-finance" class="btn-primary" type="button">Salvar na minha conta</button>',
      '<button id="cfg-sync-product-ads" class="btn-secondary" type="button"><i data-lucide="megaphone"></i> Sincronizar Ads por produto</button>',
      '<span id="cfg-finance-status" class="commerce-settings-status"></span>',
      '</div>'
    ].join('');
    configView.appendChild(panel);

    const saveBtn = document.getElementById('cfg-save-finance');
    const syncBtn = document.getElementById('cfg-sync-product-ads');
    if (saveBtn) saveBtn.addEventListener('click', saveFinanceSettingsToAccount);
    if (syncBtn) syncBtn.addEventListener('click', function () { syncProductAdsFromConfig(syncBtn); });

    loadFinanceSettingsFromAccount().then(fillFinanceSettingsForm).catch(function (error) {
      setFinanceStatus('Falha ao carregar configurações: ' + error.message, true);
    });
    if (window.lucide) lucide.createIcons();
  }

  function financeSettingInput(id, label) {
    return '<label class="ads-number-field"><span>' + html(label) + '</span><input id="' + id + '" type="number" min="0" step="0.01"></label>';
  }

  async function loadFinanceSettingsFromAccount() {
    if (!hasSupabase()) return DEFAULT_FINANCE;
    const user = await getCurrentUser();
    let userRows = [];
    if (user) {
      const { data, error } = await supabaseClient
        .from('commerce_fee_settings')
        .select('*')
        .eq('marketplace', 'shopee')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      userRows = data || [];
    }
    if (userRows.length > 0) {
      state.financeSettings = normalizeFinanceSettings(userRows[0]);
      return state.financeSettings;
    }

    const { data, error } = await supabaseClient
      .from('commerce_fee_settings')
      .select('*')
      .eq('marketplace', 'shopee')
      .is('user_id', null)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    state.financeSettings = normalizeFinanceSettings((data || [])[0] || DEFAULT_FINANCE);
    return state.financeSettings;
  }

  function normalizeFinanceSettings(row) {
    return {
      id: row.id || null,
      marketplace: row.marketplace || 'shopee',
      commission_percent: numberValue(row.commission_percent, DEFAULT_FINANCE.commission_percent),
      fixed_fee_amount: numberValue(row.fixed_fee_amount, DEFAULT_FINANCE.fixed_fee_amount),
      service_fee_percent: numberValue(row.service_fee_percent, DEFAULT_FINANCE.service_fee_percent),
      tax_percent: numberValue(row.tax_percent, DEFAULT_FINANCE.tax_percent)
    };
  }

  function fillFinanceSettingsForm(settings) {
    const cfg = settings || DEFAULT_FINANCE;
    setInput('cfg-commission', cfg.commission_percent);
    setInput('cfg-fixed-fee', cfg.fixed_fee_amount);
    setInput('cfg-service-fee', cfg.service_fee_percent);
    setInput('cfg-tax', cfg.tax_percent);
  }

  async function saveFinanceSettingsToAccount() {
    if (!hasSupabase()) return setFinanceStatus('Supabase não conectado.', true);
    const user = await getCurrentUser();
    if (!user) return setFinanceStatus('Faça login para salvar na conta.', true);

    const payload = {
      user_id: user.id,
      shop_id: getSelectedShopIdOrNull(),
      marketplace: 'shopee',
      commission_percent: readNumber('cfg-commission', DEFAULT_FINANCE.commission_percent),
      fixed_fee_amount: readNumber('cfg-fixed-fee', DEFAULT_FINANCE.fixed_fee_amount),
      service_fee_percent: readNumber('cfg-service-fee', DEFAULT_FINANCE.service_fee_percent),
      tax_percent: readNumber('cfg-tax', DEFAULT_FINANCE.tax_percent),
      is_default: true,
      valid_from: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString()
    };

    const existingId = state.financeSettings && state.financeSettings.id;
    let result;
    if (existingId) {
      result = await supabaseClient.from('commerce_fee_settings').update(payload).eq('id', existingId).eq('user_id', user.id).select('*').single();
    } else {
      result = await supabaseClient.from('commerce_fee_settings').insert(payload).select('*').single();
    }
    if (result.error) throw result.error;
    state.financeSettings = normalizeFinanceSettings(result.data);
    fillFinanceSettingsForm(state.financeSettings);
    setFinanceStatus('Configurações salvas na sua conta.', false);
    if (state.lastProductContext) updateProfitBlock(state.lastProductContext);
  }

  function setFinanceStatus(message, isError) {
    const el = document.getElementById('cfg-finance-status');
    if (!el) return;
    el.textContent = message;
    el.className = 'commerce-settings-status ' + (isError ? 'error' : 'success');
  }

  async function openProductAnalyzerV2(itemId) {
    try {
      const item = await getProduct(itemId);
      if (!item) return;
      const variations = await fetchVariations(item.item_id);
      const selectedVariation = variations[0] || null;
      const range = getRangeFromPreset('30');
      const context = { item, variations, selectedVariation, range, periodPreset: '30', dailySales: [], dailyAds: [], adsOverride: null };
      state.lastProductContext = context;
      await Promise.all([ensureFinanceSettings(), hydrateModalContext(context)]);
      renderModal(context);
    } catch (error) {
      console.error('Erro ao abrir analisador v2:', error);
      alert('Erro ao abrir produto: ' + error.message);
    }
  }

  async function ensureFinanceSettings() {
    if (!state.financeSettings) state.financeSettings = await loadFinanceSettingsFromAccount();
    return state.financeSettings;
  }

  async function hydrateModalContext(context) {
    const promises = [
      fetchDailySales(context.item.item_id, context.range),
      fetchDailyAds(context.item.item_id, context.range),
      fetchAdsOverride(context.item, context.selectedVariation, context.range)
    ];
    const [sales, ads, override] = await Promise.all(promises);
    context.dailySales = sales;
    context.dailyAds = ads;
    context.adsOverride = override;
  }

  async function getProduct(itemId) {
    const local = (window.productPerformanceData || window.shopeeProductsData || []).find(function (row) {
      return String(row.item_id) === String(itemId);
    });
    if (local) return local;
    if (!hasSupabase()) return null;
    const { data, error } = await supabaseClient.from('vw_product_performance_summary').select('*').eq('item_id', itemId).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function fetchVariations(itemId) {
    if (!hasSupabase()) return [];
    const { data, error } = await supabaseClient
      .from('vw_product_variation_performance_summary')
      .select('*')
      .eq('item_id', itemId)
      .order('units_sold_30d', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data || [];
  }

  async function fetchDailySales(itemId, range) {
    if (!hasSupabase()) return [];
    const { data, error } = await supabaseClient
      .from('vw_product_performance_daily')
      .select('*')
      .eq('item_id', itemId)
      .gte('order_date', range.start)
      .lte('order_date', range.end)
      .order('order_date', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function fetchDailyAds(itemId, range) {
    if (!hasSupabase()) return [];
    const { data, error } = await supabaseClient
      .from('vw_product_ads_daily')
      .select('*')
      .eq('item_id', itemId)
      .gte('performance_date', range.start)
      .lte('performance_date', range.end)
      .order('performance_date', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function fetchAdsOverride(item, variation, range) {
    const user = await getCurrentUser();
    if (!hasSupabase() || !user) return null;
    let query = supabaseClient
      .from('ads_cost_overrides')
      .select('*')
      .eq('user_id', user.id)
      .eq('item_id', item.item_id)
      .eq('period_start', range.start)
      .eq('period_end', range.end)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (variation && variation.model_id) query = query.eq('model_id', variation.model_id);
    else query = query.is('model_id', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || [])[0] || null;
  }

  function renderModal(context) {
    const old = document.getElementById('product-modal');
    if (old) old.remove();

    const item = context.item;
    const variation = context.selectedVariation;
    const modal = document.createElement('div');
    modal.id = 'product-modal';
    modal.className = 'modal-overlay jv-product-modal product-ads-v2-modal';
    modal.innerHTML = [
      '<div class="modal-content ads-modal-content">',
      '<div class="modal-header ads-modal-header">',
      '<div><h3>' + html(item.item_name || 'Produto sem título') + '</h3><p>Preço com desconto, custo UPSeller e Ads real da Shopee</p></div>',
      '<button class="modal-close" type="button" data-close-modal><i data-lucide="x"></i></button>',
      '</div>',
      '<div class="modal-tabs ads-tabs">',
      tabButton('overview', 'Visão geral', true),
      tabButton('diagnosis', 'Smart Diagnosis'),
      tabButton('media', 'Mídia & Atributos'),
      tabButton('sales', 'Vendas & Ads'),
      '</div>',
      '<div class="modal-body ads-modal-body">',
      renderOverview(context),
      renderDiagnosis(context),
      renderMedia(context),
      renderSalesAds(context),
      '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
    bindModalEvents(context);
    updateProfitBlock(context);
    modal.style.display = 'flex';
    state.currentModal = modal;
    if (window.lucide) lucide.createIcons();
  }

  function tabButton(id, label, active) {
    return '<button class="tab-btn ' + (active ? 'active' : '') + '" type="button" data-product-tab="' + id + '">' + html(label) + '</button>';
  }

  function renderOverview(context) {
    const item = context.item;
    const variations = context.variations;
    const variation = context.selectedVariation;
    const selector = variations.length ? [
      '<label class="ads-variation-select"><span>Variação analisada</span><select id="v2-variation-select" class="select-field">',
      variations.map(function (row) {
        const selected = variation && String(variation.model_id) === String(row.model_id) ? 'selected' : '';
        return '<option value="' + html(row.model_id) + '" ' + selected + '>' + html((row.model_name || 'Variação') + ' · ' + (row.model_sku || 'Sem SKU')) + '</option>';
      }).join(''),
      '</select></label>'
    ].join('') : '<div class="ads-info-note">Produto único: custo e preço calculados pelo SKU do anúncio.</div>';

    return [
      '<section id="product-tab-overview" class="tab-content active">',
      '<div class="product-v2-hero">',
      '<img src="' + html(safeImage(item.image_url)) + '" alt="Imagem do produto">',
      '<div><h4>' + html(item.item_name || 'Produto sem título') + '</h4><p>' + html(getSkuLabel(item, variation)) + '</p>' + selector + '</div>',
      '</div>',
      '<div class="ads-section-title product-chart-title"><h4>Vendas e receita ao longo do tempo</h4>' + renderPeriodControls(context) + '</div>',
      '<div id="product-overview-chart" class="product-combo-chart">' + renderComboChart(context.dailySales) + '</div>',
      '<div class="ads-finance-card product-profit-card">',
      '<div class="ads-section-title"><h4>Lucro final estimado</h4><span>Preço com desconto, custo UPSeller e Ads real Shopee</span></div>',
      '<div class="product-profit-inputs">',
      readOnlyMetric('Preço com desconto', currency(selectedPrice(item, variation))),
      readOnlyMetric('Custo UPSeller', selectedCost(item, variation) > 0 ? currency(selectedCost(item, variation)) : '—'),
      editableAdsMetric(context),
      '</div>',
      '<div id="product-profit-result" class="ads-finance-result"></div>',
      '</div>',
      '</section>'
    ].join('');
  }

  function renderPeriodControls(context) {
    return [
      '<div class="product-period-controls">',
      '<select id="product-period-select" class="select-field">',
      '<option value="7">7d</option>',
      '<option value="15">15d</option>',
      '<option value="30" selected>30d</option>',
      '<option value="365">1y</option>',
      '<option value="custom">Personalizado</option>',
      '</select>',
      '<input id="product-period-start" type="date" value="' + html(context.range.start) + '" hidden>',
      '<input id="product-period-end" type="date" value="' + html(context.range.end) + '" hidden>',
      '</div>'
    ].join('');
  }

  function readOnlyMetric(label, value) {
    return '<div class="ads-metric"><span>' + html(label) + '</span><strong>' + html(value) + '</strong></div>';
  }

  function editableAdsMetric(context) {
    const realAds = sumRows(context.dailyAds, 'expense');
    const value = context.adsOverride ? numberValue(context.adsOverride.ads_cost_amount, realAds) : realAds;
    const source = context.adsOverride ? 'Editado na conta' : 'API Shopee';
    return '<label class="ads-number-field product-ads-cost-field"><span>Ads Shopee real <small>' + html(source) + '</small></span><input id="product-ads-cost-input" type="number" min="0" step="0.01" value="' + value.toFixed(2) + '"><button id="product-save-ads-cost" type="button" class="btn-secondary">Salvar ajuste</button></label>';
  }

  function renderDiagnosis(context) {
    const ads = sumRows(context.dailyAds, 'expense');
    const sales = sumRows(context.dailySales, 'units_sold');
    const revenue = sumRows(context.dailySales, 'gross_revenue');
    const cost = selectedCost(context.item, context.selectedVariation);
    const price = selectedPrice(context.item, context.selectedVariation);
    const insights = [
      ['Demanda', sales > 0 ? 'Produto vendeu no período' : 'Sem venda no período', sales > 0 ? sales + ' unidades e ' + currency(revenue) + ' em receita.' : 'Revisar oferta antes de aumentar investimento.'],
      ['Ads Shopee', ads > 0 ? 'Ads encontrado pela API' : 'Sem custo de Ads no período', ads > 0 ? 'Despesa real: ' + currency(ads) + '.' : 'Clique em sincronizar Ads se ainda não atualizou o período.'],
      ['Margem', cost > 0 ? 'Custo UPSeller encontrado' : 'Custo ausente no UPSeller', cost > 0 ? 'Custo base: ' + currency(cost) + ' para preço de ' + currency(price) + '.' : 'Importar/atualizar estoque UPSeller para fechar margem.']
    ];
    return '<section id="product-tab-diagnosis" class="tab-content"><div class="ads-diagnosis-grid">' + insights.map(function (row) {
      return '<div class="ads-diagnosis-card"><div><span>' + html(row[0]) + '</span><strong>' + html(row[1]) + '</strong></div><p>' + html(row[2]) + '</p></div>';
    }).join('') + '</div></section>';
  }

  function renderMedia(context) {
    const attrs = normalizeAttributes(context.item.attributes_json);
    const images = normalizeImages(context.item.images_json, context.item.image_url);
    return [
      '<section id="product-tab-media" class="tab-content">',
      '<div class="ads-section-title"><h4>Mídia</h4><span>' + images.length + ' imagem(ns)</span></div>',
      '<div class="ads-media-grid">' + images.map(function (url) { return '<div class="ads-media-item"><img src="' + html(safeImage(url)) + '" alt="Imagem"><span>Imagem sincronizada</span></div>'; }).join('') + '</div>',
      '<div class="ads-section-title"><h4>Ficha Técnica (Atributos)</h4><span>' + attrs.length + ' atributo(s)</span></div>',
      '<div class="ads-attributes-grid">' + (attrs.map(function (attr) { return '<div class="attr-item"><span>' + html(attr.name) + '</span><strong>' + html(attr.value) + '</strong></div>'; }).join('') || '<div class="ads-empty-block">Nenhum atributo sincronizado.</div>') + '</div>',
      '</section>'
    ].join('');
  }

  function renderSalesAds(context) {
    return [
      '<section id="product-tab-sales" class="tab-content">',
      '<div class="ads-kpi-grid ads-kpi-compact">',
      metric('Unidades vendidas', integer(sumRows(context.dailySales, 'units_sold'))),
      metric('Receita', currency(sumRows(context.dailySales, 'gross_revenue'))),
      metric('Ads Shopee', currency(sumRows(context.dailyAds, 'expense'))),
      metric('ROAS direto', roas(context.dailyAds, 'direct_gmv')),
      '</div>',
      '<div class="ads-section-title"><h4>Ads por produto via Shopee API</h4><span>Campanhas ligadas a item_id</span></div>',
      renderAdsTable(context.dailyAds),
      '</section>'
    ].join('');
  }

  function bindModalEvents(context) {
    const modal = document.getElementById('product-modal');
    if (!modal) return;
    const close = modal.querySelector('[data-close-modal]');
    if (close) close.addEventListener('click', function () { modal.remove(); state.currentModal = null; });

    modal.querySelectorAll('[data-product-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        const tabId = button.getAttribute('data-product-tab');
        modal.querySelectorAll('.tab-btn').forEach(function (btn) { btn.classList.remove('active'); });
        modal.querySelectorAll('.tab-content').forEach(function (tab) { tab.classList.remove('active'); });
        button.classList.add('active');
        const tab = modal.querySelector('#product-tab-' + tabId);
        if (tab) tab.classList.add('active');
      });
    });

    const variationSelect = document.getElementById('v2-variation-select');
    if (variationSelect) variationSelect.addEventListener('change', async function () {
      context.selectedVariation = context.variations.find(function (row) { return String(row.model_id) === String(variationSelect.value); }) || null;
      context.adsOverride = await fetchAdsOverride(context.item, context.selectedVariation, context.range);
      renderModal(context);
    });

    const periodSelect = document.getElementById('product-period-select');
    const startInput = document.getElementById('product-period-start');
    const endInput = document.getElementById('product-period-end');
    if (periodSelect) periodSelect.addEventListener('change', function () {
      const custom = periodSelect.value === 'custom';
      if (startInput) startInput.hidden = !custom;
      if (endInput) endInput.hidden = !custom;
      if (!custom) changePeriod(context, periodSelect.value);
    });
    [startInput, endInput].forEach(function (input) {
      if (input) input.addEventListener('change', function () {
        if (periodSelect && periodSelect.value === 'custom' && startInput.value && endInput.value) {
          changePeriod(context, 'custom', startInput.value, endInput.value);
        }
      });
    });

    const saveAds = document.getElementById('product-save-ads-cost');
    if (saveAds) saveAds.addEventListener('click', function () { saveAdsOverride(context); });
    const adsInput = document.getElementById('product-ads-cost-input');
    if (adsInput) adsInput.addEventListener('input', function () { updateProfitBlock(context); });
  }

  async function changePeriod(context, preset, start, end) {
    context.periodPreset = preset;
    context.range = preset === 'custom' ? { start: start, end: end } : getRangeFromPreset(preset);
    await hydrateModalContext(context);
    renderModal(context);
  }

  async function saveAdsOverride(context) {
    const user = await getCurrentUser();
    if (!user) return alert('Faça login para salvar ajuste de Ads na conta.');
    const value = readNumber('product-ads-cost-input', 0);
    const variation = context.selectedVariation;
    const payload = {
      user_id: user.id,
      shop_id: context.item.shop_id || getSelectedShopIdOrNull(),
      item_id: context.item.item_id,
      model_id: variation && variation.model_id ? variation.model_id : null,
      period_start: context.range.start,
      period_end: context.range.end,
      ads_cost_amount: value,
      source: 'manual',
      notes: 'Ajuste manual no Analisador de Anúncios',
      updated_at: new Date().toISOString()
    };
    const existing = context.adsOverride;
    let result;
    if (existing && existing.id) {
      result = await supabaseClient.from('ads_cost_overrides').update(payload).eq('id', existing.id).eq('user_id', user.id).select('*').single();
    } else {
      result = await supabaseClient.from('ads_cost_overrides').insert(payload).select('*').single();
    }
    if (result.error) return alert('Falha ao salvar Ads: ' + result.error.message);
    context.adsOverride = result.data;
    updateProfitBlock(context);
    alert('Custo de Ads salvo na sua conta.');
  }

  function updateProfitBlock(context) {
    const result = document.getElementById('product-profit-result');
    if (!result) return;
    const finance = state.financeSettings || DEFAULT_FINANCE;
    const price = selectedPrice(context.item, context.selectedVariation);
    const cost = selectedCost(context.item, context.selectedVariation);
    const realAds = sumRows(context.dailyAds, 'expense');
    const adsCost = readNumber('product-ads-cost-input', context.adsOverride ? numberValue(context.adsOverride.ads_cost_amount, realAds) : realAds);
    const units = Math.max(sumRows(context.dailySales, 'units_sold'), 1);
    const adsPerUnit = adsCost / units;
    const commission = price * (numberValue(finance.commission_percent, 0) / 100);
    const service = price * (numberValue(finance.service_fee_percent, 0) / 100);
    const tax = price * (numberValue(finance.tax_percent, 0) / 100);
    const fixed = numberValue(finance.fixed_fee_amount, 0);
    const unitProfit = price - commission - fixed - service - tax - cost - adsPerUnit;
    const margin = price > 0 ? (unitProfit / price) * 100 : 0;
    result.innerHTML = [
      metric('Lucro unitário', currency(unitProfit), unitProfit >= 0 ? 'positive' : 'negative'),
      metric('Margem final', margin.toFixed(1) + '%', margin >= 15 ? 'positive' : margin >= 0 ? 'warning' : 'negative'),
      metric('Ads por venda', currency(adsPerUnit), adsPerUnit > 0 ? 'warning' : ''),
      metric('Lucro no período', currency(unitProfit * units), unitProfit >= 0 ? 'positive' : 'negative')
    ].join('');
  }

  async function syncProductAdsFromConfig(button) {
    if (!hasSupabase()) return setFinanceStatus('Supabase não conectado.', true);
    const session = (await supabaseClient.auth.getSession()).data.session;
    if (!session) return setFinanceStatus('Faça login para sincronizar Ads.', true);
    const shopId = getSelectedShopIdOrNull() || ((window.userShops || [])[0] && (window.userShops || [])[0].shop_id);
    if (!shopId) return setFinanceStatus('Selecione ou vincule uma loja Shopee.', true);

    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Sincronizando...';
    if (window.lucide) lucide.createIcons();
    try {
      await callProductAdsSync(shopId, 30);
      setFinanceStatus('Ads por produto sincronizado pela Shopee API.', false);
    } catch (error) {
      setFinanceStatus('Falha ao sincronizar Ads: ' + error.message, true);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
      if (window.lucide) lucide.createIcons();
    }
  }

  async function callProductAdsSync(shopId, days) {
    const session = (await supabaseClient.auth.getSession()).data.session;
    if (!session) throw new Error('Usuário não autenticado.');
    const base = String(supabaseUrl || '').replace(/\/$/, '');
    const response = await fetch(base + '/functions/v1/' + PRODUCT_ADS_FUNCTION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ shop_id: Number(shopId), days: days || 30 })
    });
    const json = await response.json().catch(function () { return {}; });
    if (!response.ok || !json.ok) throw new Error(json.error || ('HTTP ' + response.status));
    return json.result;
  }

  function renderComboChart(rows) {
    const daily = consolidateSales(rows);
    if (!daily.length) return '<div class="ads-empty-block">Sem vendas no período selecionado.</div>';
    const width = 760;
    const height = 260;
    const pad = 34;
    const maxUnits = Math.max(1, Math.max.apply(null, daily.map(function (row) { return row.units; })));
    const maxRevenue = Math.max(1, Math.max.apply(null, daily.map(function (row) { return row.revenue; })));
    const barSlot = (width - pad * 2) / daily.length;
    const points = [];
    const bars = daily.map(function (row, index) {
      const x = pad + index * barSlot;
      const barHeight = (row.units / maxUnits) * (height - pad * 2);
      const y = height - pad - barHeight;
      const lineY = height - pad - ((row.revenue / maxRevenue) * (height - pad * 2));
      points.push([x + barSlot / 2, lineY].join(','));
      return '<rect x="' + (x + 2) + '" y="' + y + '" width="' + Math.max(2, barSlot - 4) + '" height="' + barHeight + '" rx="3"><title>' + html(formatDate(row.date) + ' · ' + row.units + ' un · ' + currency(row.revenue)) + '</title></rect>';
    }).join('');
    const labels = daily.filter(function (_, index) { return index === 0 || index === daily.length - 1 || index % Math.ceil(daily.length / 6) === 0; }).map(function (row, index) {
      const originalIndex = daily.indexOf(row);
      const x = pad + originalIndex * barSlot + barSlot / 2;
      return '<text x="' + x + '" y="' + (height - 8) + '" text-anchor="middle">' + html(formatDate(row.date)) + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Vendas e receita"><g class="combo-bars">' + bars + '</g><polyline class="combo-line" fill="none" points="' + points.join(' ') + '"></polyline><g class="combo-labels">' + labels + '</g></svg><div class="combo-legend"><span><i></i> Vendas</span><span><i></i> Receita</span></div>';
  }

  function renderAdsTable(rows) {
    if (!rows.length) return '<div class="ads-empty-block">Nenhum Ads por produto sincronizado neste período. Use o botão de sincronização em Configurações.</div>';
    return '<div class="table-container"><table class="data-table"><thead><tr><th>Data</th><th style="text-align:right">Gasto</th><th style="text-align:right">Receita direta</th><th style="text-align:right">Cliques</th><th style="text-align:right">ROAS</th></tr></thead><tbody>' + rows.map(function (row) {
      return '<tr><td>' + html(formatDate(row.performance_date)) + '</td><td style="text-align:right">' + currency(row.expense) + '</td><td style="text-align:right">' + currency(row.direct_gmv) + '</td><td style="text-align:right">' + integer(row.clicks) + '</td><td style="text-align:right">' + numberValue(row.direct_roas, 0).toFixed(2) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function consolidateSales(rows) {
    const map = new Map();
    rows.forEach(function (row) {
      const date = String(row.order_date || '').slice(0, 10);
      if (!date) return;
      const current = map.get(date) || { date: date, units: 0, revenue: 0 };
      current.units += numberValue(row.units_sold, 0);
      current.revenue += numberValue(row.gross_revenue, 0);
      map.set(date, current);
    });
    return Array.from(map.values()).sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  function getRangeFromPreset(preset) {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    const days = preset === '365' ? 365 : Number(preset || 30);
    start.setDate(end.getDate() - (days - 1));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }

  function selectedPrice(item, variation) {
    if (variation) {
      const current = numberValue(variation.current_price, 0);
      if (current > 0) return current;
      const units = numberValue(variation.units_sold_30d, 0);
      const revenue = numberValue(variation.revenue_30d, 0);
      if (units > 0 && revenue > 0) return revenue / units;
    }
    const current = numberValue(item.current_price, 0);
    if (current > 0) return current;
    const units30 = numberValue(item.sales_30d, 0);
    const revenue30 = numberValue(item.revenue_30d, 0);
    return units30 > 0 && revenue30 > 0 ? revenue30 / units30 : 0;
  }

  function selectedCost(item, variation) {
    if (variation && numberValue(variation.upseller_average_cost, 0) > 0) return numberValue(variation.upseller_average_cost, 0);
    return numberValue(item.upseller_average_cost, 0);
  }

  function getSkuLabel(item, variation) {
    if (variation) return variation.model_sku || 'Variação sem SKU';
    return item.has_model || numberValue(item.variation_count, 0) > 0 ? 'Produto com Variações' : (item.item_sku || 'Sem SKU');
  }

  function metric(label, value, tone) {
    return '<div class="ads-metric ' + html(tone || '') + '"><span>' + html(label) + '</span><strong>' + html(value) + '</strong></div>';
  }

  function roas(rows, revenueKey) {
    const expense = sumRows(rows, 'expense');
    const revenue = sumRows(rows, revenueKey);
    return expense > 0 ? (revenue / expense).toFixed(2) : '—';
  }

  function sumRows(rows, key) {
    return (rows || []).reduce(function (sum, row) { return sum + numberValue(row[key], 0); }, 0);
  }

  function normalizeImages(value, cover) {
    const parsed = parseMaybeJson(value);
    const out = [];
    if (cover) out.push(cover);
    if (Array.isArray(parsed)) parsed.forEach(function (img) {
      const url = typeof img === 'string' ? img : img && (img.url || img.image_url || img.imageUrl);
      if (url && !out.includes(url)) out.push(url);
    });
    return out;
  }

  function normalizeAttributes(value) {
    const parsed = parseMaybeJson(value);
    const attrs = Array.isArray(parsed) ? parsed : [];
    return attrs.map(function (attr, index) {
      const name = attr.display_attribute_name || attr.attribute_name || attr.name || attr.original_attribute_name || ('Atributo ' + (index + 1));
      const list = parseMaybeJson(attr.attribute_value_list || attr.values || attr.attribute_values);
      let val = '';
      if (Array.isArray(list)) val = list.map(function (entry) {
        if (!entry) return '';
        if (typeof entry !== 'object') return String(entry);
        return entry.display_value_name || entry.value_name || entry.original_value_name || entry.name || entry.value || '';
      }).filter(Boolean).join(', ');
      if (!val) val = attr.display_value_name || attr.value_name || attr.original_value_name || attr.value || attr.attribute_value || 'Não informado';
      return { name: String(name || 'Atributo'), value: String(val || 'Não informado') };
    }).filter(function (attr) { return attr.name !== 'undefined' && attr.value !== 'undefined'; });
  }

  function parseMaybeJson(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (error) { return value; }
    }
    return value;
  }

  async function getCurrentUser() {
    if (!hasSupabase()) return null;
    const { data } = await supabaseClient.auth.getUser();
    return data && data.user ? data.user : null;
  }

  function getSelectedShopIdOrNull() {
    if (typeof selectedShop !== 'undefined' && selectedShop && selectedShop !== 'all') return Number(selectedShop);
    const select = document.getElementById('select-shop');
    if (select && select.value && select.value !== 'all') return Number(select.value);
    return null;
  }

  function hasSupabase() {
    return typeof supabaseClient !== 'undefined' && !!supabaseClient;
  }

  function safeImage(url) {
    if (!url) return 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=120&auto=format&fit=crop&q=60';
    try {
      const parsed = new URL(String(url), window.location.href);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function setInput(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = numberValue(value, 0).toFixed(2);
  }

  function readNumber(id, fallback) {
    const input = document.getElementById(id);
    return input ? numberValue(input.value, fallback) : fallback;
  }

  function numberValue(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback || 0;
    const num = Number(typeof value === 'string' ? value.replace(',', '.') : value);
    return Number.isFinite(num) ? num : (fallback || 0);
  }

  function currency(value) {
    if (typeof formatCurrency === 'function') return formatCurrency(numberValue(value, 0));
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numberValue(value, 0));
  }

  function integer(value) {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(numberValue(value, 0));
  }

  function formatDate(value) {
    const parts = String(value || '').slice(0, 10).split('-');
    return parts.length === 3 ? parts[2] + '/' + parts[1] : String(value || '-');
  }

  function html(value) {
    if (typeof escapeHTML === 'function') return escapeHTML(value);
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install);
  else install();
})();
