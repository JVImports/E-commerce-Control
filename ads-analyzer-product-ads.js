// JV Imports Ads Analyzer v2: real Shopee product Ads + account finance settings.
(function () {
  'use strict';

  var PRODUCT_ADS_FUNCTION = 'shopee-sync-v2';
  var DEFAULT_FINANCE = {
    commission_percent: 14,
    fixed_fee_amount: 4,
    service_fee_percent: 0,
    tax_percent: 0
  };

  var state = {
    currentModal: null,
    financeSettings: null,
    financeShopId: null,
    lastProductContext: null
  };

  function install() {
    installConfigPanel();
    installTableInterceptor();
    patchAnalyzerOpen();
    window.jvProductAdsAnalyzerV2 = {
      open: openProductAnalyzerV2,
      syncProductAds: callProductAdsSync,
      refreshConfig: installConfigPanel
    };
  }

  function patchAnalyzerOpen() {
    window.openProductOptimizer = openProductAnalyzerV2;
    if (window.jvAdsAnalyzer) window.jvAdsAnalyzer.open = openProductAnalyzerV2;
  }

  function installTableInterceptor() {
    var table = document.getElementById('table-listings');
    if (!table || table.dataset.productAdsV2 === 'true') return;
    table.dataset.productAdsV2 = 'true';
    table.addEventListener('click', function (event) {
      var row = event.target && event.target.closest ? event.target.closest('tr[data-item-id]') : null;
      if (!row) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      openProductAnalyzerV2(row.getAttribute('data-item-id'), row.getAttribute('data-shop-id'));
    }, true);
  }

  function installConfigPanel() {
    var configView = document.getElementById('config-view');
    if (!configView || document.getElementById('commerce-finance-settings-panel')) return;

    var panel = document.createElement('div');
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
      '<button id="cfg-sync-product-ads" class="btn-secondary" type="button"><i data-lucide="file-up"></i> Importar relatório de Ads</button>',
      '<span id="cfg-finance-status" class="commerce-settings-status"></span>',
      '</div>'
    ].join('');
    configView.appendChild(panel);

    var saveBtn = document.getElementById('cfg-save-finance');
    var syncBtn = document.getElementById('cfg-sync-product-ads');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      saveFinanceSettingsToAccount().catch(function (error) { setFinanceStatus('Falha ao salvar: ' + error.message, true); });
    });
    if (syncBtn) syncBtn.addEventListener('click', function () {
      if (typeof window.switchView === 'function') window.switchView('anuncios');
      window.setTimeout(function () {
        var panel = document.getElementById('jv-ads-import-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    });

    loadFinanceSettingsFromAccount(getSelectedShopIdOrNull()).then(fillFinanceSettingsForm).catch(function (error) {
      setFinanceStatus('Falha ao carregar configurações: ' + error.message, true);
    });
    if (!document.documentElement.dataset.financeShopListener) {
      document.documentElement.dataset.financeShopListener = 'true';
      document.addEventListener('change', function (event) {
        if (!event.target || event.target.id !== 'select-shop') return;
        state.financeSettings = null;
        state.financeShopId = null;
        loadFinanceSettingsFromAccount(getSelectedShopIdOrNull()).then(fillFinanceSettingsForm).catch(function (error) {
          setFinanceStatus('Falha ao carregar configurações: ' + error.message, true);
        });
      });
    }
    if (window.lucide) lucide.createIcons();
  }

  function financeSettingInput(id, label) {
    return '<label class="ads-number-field"><span>' + html(label) + '</span><input id="' + id + '" type="number" min="0" step="0.01"></label>';
  }

  async function loadFinanceSettingsFromAccount(shopId) {
    if (!hasSupabase()) return DEFAULT_FINANCE;
    var normalizedShopId = shopId ? Number(shopId) : null;
    var user = await getCurrentUser();
    if (user && normalizedShopId) {
      var own = await supabaseClient
        .from('commerce_fee_settings')
        .select('*')
        .eq('marketplace', 'shopee')
        .eq('user_id', user.id)
        .eq('shop_id', normalizedShopId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (own.error) throw own.error;
      if ((own.data || []).length) {
        state.financeSettings = normalizeFinanceSettings(own.data[0]);
        state.financeShopId = normalizedShopId;
        return state.financeSettings;
      }
    }

    var fallback = await supabaseClient
      .from('commerce_fee_settings')
      .select('*')
      .eq('marketplace', 'shopee')
      .is('user_id', null)
      .is('shop_id', null)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (fallback.error) throw fallback.error;
    state.financeSettings = normalizeFinanceSettings((fallback.data || [])[0] || DEFAULT_FINANCE);
    state.financeShopId = normalizedShopId;
    return state.financeSettings;
  }

  function normalizeFinanceSettings(row) {
    row = row || DEFAULT_FINANCE;
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
    var cfg = settings || DEFAULT_FINANCE;
    setInput('cfg-commission', cfg.commission_percent);
    setInput('cfg-fixed-fee', cfg.fixed_fee_amount);
    setInput('cfg-service-fee', cfg.service_fee_percent);
    setInput('cfg-tax', cfg.tax_percent);
  }

  async function saveFinanceSettingsToAccount() {
    if (!hasSupabase()) return setFinanceStatus('Supabase não conectado.', true);
    var user = await getCurrentUser();
    if (!user) return setFinanceStatus('Faça login para salvar na conta.', true);

    var shopId = getSelectedShopIdOrNull();
    if (!shopId) return setFinanceStatus('Selecione uma loja específica antes de salvar.', true);

    var payload = {
      user_id: user.id,
      shop_id: shopId,
      marketplace: 'shopee',
      commission_percent: readNumber('cfg-commission', DEFAULT_FINANCE.commission_percent),
      fixed_fee_amount: readNumber('cfg-fixed-fee', DEFAULT_FINANCE.fixed_fee_amount),
      service_fee_percent: readNumber('cfg-service-fee', DEFAULT_FINANCE.service_fee_percent),
      tax_percent: readNumber('cfg-tax', DEFAULT_FINANCE.tax_percent),
      is_default: true,
      valid_from: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString()
    };

    var existingId = state.financeSettings && state.financeSettings.id;
    var result = existingId
      ? await supabaseClient.from('commerce_fee_settings').update(payload).eq('id', existingId).eq('user_id', user.id).eq('shop_id', shopId).select('*').single()
      : await supabaseClient.from('commerce_fee_settings').insert(payload).select('*').single();
    if (result.error) throw result.error;
    state.financeSettings = normalizeFinanceSettings(result.data);
    state.financeShopId = shopId;
    fillFinanceSettingsForm(state.financeSettings);
    setFinanceStatus('Configurações salvas na sua conta.', false);
    if (state.lastProductContext) updateProfitBlock(state.lastProductContext);
  }

  function setFinanceStatus(message, isError) {
    var el = document.getElementById('cfg-finance-status');
    if (!el) return;
    el.textContent = message;
    el.className = 'commerce-settings-status ' + (isError ? 'error' : 'success');
  }

  async function openProductAnalyzerV2(itemId, shopId) {
    try {
      var item = await getProduct(itemId, shopId);
      if (!item) return showPageMessage('Produto não encontrado para análise.', true);
      var variations = await fetchVariations(item.item_id, item.shop_id);
      var selectedVariation = null;
      var range = getRangeFromPreset('30');
      var context = { item: item, variations: variations, selectedVariation: selectedVariation, range: range, periodPreset: '30', dailySales: [], dailyAds: [], adsOverride: null };
      state.lastProductContext = context;
      await Promise.all([ensureFinanceSettings(item.shop_id), hydrateModalContext(context)]);
      renderModal(context);
    } catch (error) {
      console.error('Erro ao abrir analisador v2:', error);
      showPageMessage('Erro ao abrir produto: ' + error.message, true);
    }
  }

  async function ensureFinanceSettings(shopId) {
    var normalizedShopId = shopId ? Number(shopId) : null;
    if (!state.financeSettings || String(state.financeShopId || '') !== String(normalizedShopId || '')) {
      state.financeSettings = await loadFinanceSettingsFromAccount(normalizedShopId);
    }
    return state.financeSettings;
  }

  async function hydrateModalContext(context) {
    var results = await Promise.all([
      fetchDailySales(context.item.item_id, context.item.shop_id, context.range),
      fetchDailyAds(context.item.item_id, context.item.shop_id, context.range),
      fetchAdsOverride(context.item, context.selectedVariation, context.range)
    ]);
    context.dailySales = results[0];
    context.dailyAds = results[1];
    context.adsOverride = results[2];
  }

  async function getProduct(itemId, shopId) {
    var explicitShopId = shopId ? Number(shopId) : getSelectedShopIdOrNull();
    var localMatches = (window.productPerformanceData || window.shopeeProductsData || []).filter(function (row) {
      return String(row.item_id) === String(itemId) && (!explicitShopId || String(row.shop_id) === String(explicitShopId));
    });
    if (!explicitShopId) {
      var shops = Array.from(new Set(localMatches.map(function (row) { return String(row.shop_id || ''); }).filter(Boolean)));
      if (shops.length > 1) throw new Error('Este item existe em mais de uma loja. Selecione uma loja específica.');
    }
    if (localMatches.length) return localMatches[0];
    if (!hasSupabase()) return null;

    var query = supabaseClient.from('vw_product_performance_summary').select('*').eq('item_id', itemId);
    if (explicitShopId) query = query.eq('shop_id', explicitShopId);
    var result = await query.limit(explicitShopId ? 1 : 2);
    if (result.error) throw result.error;
    var rows = result.data || [];
    if (!explicitShopId && rows.length > 1) throw new Error('Este item existe em mais de uma loja. Selecione uma loja específica.');
    return rows[0] || null;
  }

  async function fetchVariations(itemId, shopId) {
    if (!hasSupabase()) return [];
    var result = await supabaseClient
      .from('vw_product_variation_performance_summary')
      .select('*')
      .eq('shop_id', shopId)
      .eq('item_id', itemId)
      .order('units_sold_30d', { ascending: false, nullsFirst: false });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function fetchDailySales(itemId, shopId, range) {
    if (!hasSupabase()) return [];
    var result = await supabaseClient
      .from('vw_product_performance_daily')
      .select('*')
      .eq('shop_id', shopId)
      .eq('item_id', itemId)
      .gte('order_date', range.start)
      .lte('order_date', range.end)
      .order('order_date', { ascending: true });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function fetchDailyAds(itemId, shopId, range) {
    if (!hasSupabase()) return [];
    var result = await supabaseClient
      .from('vw_product_ads_daily')
      .select('*')
      .eq('shop_id', shopId)
      .eq('item_id', itemId)
      .gte('performance_date', range.start)
      .lte('performance_date', range.end)
      .order('performance_date', { ascending: true });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function fetchAdsOverride(item, variation, range) {
    var user = await getCurrentUser();
    if (!hasSupabase() || !user || !item.shop_id) return null;
    var result = await supabaseClient
      .from('ads_cost_overrides')
      .select('*')
      .eq('user_id', user.id)
      .eq('shop_id', item.shop_id)
      .eq('item_id', item.item_id)
      .is('model_id', null)
      .eq('period_start', range.start)
      .eq('period_end', range.end)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    return (result.data || [])[0] || null;
  }

  function renderModal(context) {
    var old = document.getElementById('product-modal');
    if (old) old.remove();

    var item = context.item;
    var modal = document.createElement('div');
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
    hydrateImageQuality(modal);
    modal.style.display = 'flex';
    state.currentModal = modal;
    if (window.lucide) lucide.createIcons();
  }

  function tabButton(id, label, active) {
    return '<button class="tab-btn ' + (active ? 'active' : '') + '" type="button" data-product-tab="' + id + '">' + html(label) + '</button>';
  }

  function renderOverview(context) {
    var item = context.item;
    var variations = context.variations;
    var variation = context.selectedVariation;
    var selector = variations.length ? [
      '<label class="ads-variation-select"><span>Variação analisada</span><select id="v2-variation-select" class="select-field">',
      '<option value="" ' + (!variation ? 'selected' : '') + '>Produto consolidado</option>',
      variations.map(function (row) {
        var selected = variation && String(variation.model_id) === String(row.model_id) ? 'selected' : '';
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
      '<div id="product-modal-status" class="product-modal-status"></div>',
      '</div>',
      '</section>'
    ].join('');
  }

  function renderPeriodControls(context) {
    var preset = context.periodPreset || '30';
    return [
      '<div class="product-period-controls">',
      '<select id="product-period-select" class="select-field">',
      option('7', '7d', preset),
      option('15', '15d', preset),
      option('30', '30d', preset),
      option('365', '1y', preset),
      option('custom', 'Personalizado', preset),
      '</select>',
      '<input id="product-period-start" type="date" value="' + html(context.range.start) + '" ' + (preset === 'custom' ? '' : 'hidden') + '>',
      '<input id="product-period-end" type="date" value="' + html(context.range.end) + '" ' + (preset === 'custom' ? '' : 'hidden') + '>',
      '</div>'
    ].join('');
  }

  function option(value, label, current) {
    return '<option value="' + value + '" ' + (String(value) === String(current) ? 'selected' : '') + '>' + label + '</option>';
  }

  function readOnlyMetric(label, value) {
    return '<div class="ads-metric"><span>' + html(label) + '</span><strong>' + html(value) + '</strong></div>';
  }

  function editableAdsMetric(context) {
    var realAds = sumRows(context.dailyAds, 'expense');
    var value = context.adsOverride ? numberValue(context.adsOverride.ads_cost_amount, realAds) : realAds;
    var source = context.adsOverride ? 'Editado na conta' : 'API Shopee';
    return '<label class="ads-number-field product-ads-cost-field"><span>Ads Shopee real <small>' + html(source) + '</small></span><input id="product-ads-cost-input" type="number" min="0" step="0.01" value="' + value.toFixed(2) + '"><button id="product-save-ads-cost" type="button" class="btn-secondary">Salvar ajuste</button></label>';
  }

  function renderDiagnosis(context) {
    var ads = sumRows(context.dailyAds, 'expense');
    var sales = sumRows(context.dailySales, 'units_sold');
    var revenue = sumRows(context.dailySales, 'gross_revenue');
    var cost = selectedCost(context.item, context.selectedVariation);
    var price = selectedPrice(context.item, context.selectedVariation);
    var insights = [
      ['Demanda', sales > 0 ? 'Produto vendeu no período' : 'Sem venda no período', sales > 0 ? sales + ' unidades e ' + currency(revenue) + ' em receita.' : 'Revisar oferta antes de aumentar investimento.'],
      ['Ads Shopee', ads > 0 ? 'Ads encontrado pela API' : 'Sem custo de Ads no período', ads > 0 ? 'Despesa real: ' + currency(ads) + '.' : 'Sincronize Ads por produto em Configurações para preencher este dado real.'],
      ['Margem', cost > 0 ? 'Custo UPSeller encontrado' : 'Custo ausente no UPSeller', cost > 0 ? 'Custo base: ' + currency(cost) + ' para preço de ' + currency(price) + '.' : 'Importar/atualizar estoque UPSeller para fechar margem.']
    ];
    return '<section id="product-tab-diagnosis" class="tab-content"><div class="ads-diagnosis-grid">' + insights.map(function (row) {
      return '<div class="ads-diagnosis-card"><div><span>' + html(row[0]) + '</span><strong>' + html(row[1]) + '</strong></div><p>' + html(row[2]) + '</p></div>';
    }).join('') + '</div></section>';
  }

  function renderMedia(context) {
    var attrs = normalizeAttributes(context.item.attributes_json);
    var images = normalizeImages(context.item.images_json, context.item.image_url);
    return [
      '<section id="product-tab-media" class="tab-content">',
      '<div class="ads-section-title"><h4>Mídia</h4><span>' + images.length + ' imagem(ns)</span></div>',
      '<div class="ads-media-grid">' + (images.map(function (url, index) { return renderImageQualityCard(url, index); }).join('') || '<div class="ads-empty-block">Nenhuma imagem sincronizada.</div>') + '</div>',
      '<div class="ads-section-title"><h4>Ficha Técnica (Atributos)</h4><span>' + attrs.length + ' atributo(s)</span></div>',
      '<div class="ads-attributes-grid">' + (attrs.map(function (attr) { return '<div class="attr-item"><span>' + html(attr.name) + '</span><strong>' + html(attr.value) + '</strong></div>'; }).join('') || '<div class="ads-empty-block">Nenhum atributo sincronizado.</div>') + '</div>',
      '</section>'
    ].join('');
  }

  function renderImageQualityCard(url, index) {
    return [
      '<div class="ads-media-item" data-image-quality-card="true">',
      '<img src="' + html(safeImage(url)) + '" loading="lazy" alt="Imagem ' + (index + 1) + '">',
      '<div class="ads-media-quality-meta quality-pending">',
      '<strong>Verificando resolução</strong>',
      '<span>Imagem sincronizada</span>',
      '</div>',
      '</div>'
    ].join('');
  }

  function hydrateImageQuality(root) {
    root.querySelectorAll('[data-image-quality-card="true"]').forEach(function (card) {
      var img = card.querySelector('img');
      var meta = card.querySelector('.ads-media-quality-meta');
      if (!img || !meta) return;
      var update = function () {
        var width = img.naturalWidth || 0;
        var height = img.naturalHeight || 0;
        if (!width || !height) {
          setImageQuality(meta, 'low', 'Baixa', 'Não foi possível ler a resolução');
          return;
        }
        var shortest = Math.min(width, height);
        var ratioDiff = Math.abs(width - height) / Math.max(width, height);
        var isSquareEnough = ratioDiff <= 0.12;
        if (shortest >= 1000 && isSquareEnough) setImageQuality(meta, 'high', 'Alta', width + ' x ' + height + ' px');
        else if (shortest >= 700) setImageQuality(meta, 'medium', 'Média', width + ' x ' + height + ' px' + (isSquareEnough ? '' : ' · proporção irregular'));
        else setImageQuality(meta, 'low', 'Baixa', width + ' x ' + height + ' px');
      };
      if (img.complete) update();
      else {
        img.addEventListener('load', update, { once: true });
        img.addEventListener('error', function () { setImageQuality(meta, 'low', 'Erro', 'Imagem não carregou'); }, { once: true });
      }
    });
  }

  function setImageQuality(meta, level, label, detail) {
    meta.className = 'ads-media-quality-meta quality-' + level;
    meta.innerHTML = '<strong>' + html(label) + '</strong><span>' + html(detail) + '</span>';
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
      '<div class="ads-section-title"><h4>Histórico horizontal de vendas e Ads</h4><span>' + html(context.range.start) + ' até ' + html(context.range.end) + '</span></div>',
      renderHorizontalSalesAdsChart(context),
      '<div class="ads-section-title"><h4>Ads por produto via Shopee API</h4><span>Campanhas ligadas a item_id</span></div>',
      renderAdsTable(context.dailyAds),
      '</section>'
    ].join('');
  }

  function renderHorizontalSalesAdsChart(context) {
    var rows = buildHorizontalRows(context);
    if (!rows.length) return '<div class="ads-empty-block">Sem vendas ou Ads no período selecionado.</div>';
    var maxUnits = Math.max(1, Math.max.apply(null, rows.map(function (row) { return row.units; })));
    var maxAds = Math.max(1, Math.max.apply(null, rows.map(function (row) { return row.ads; })));
    return [
      '<div class="sales-ads-horizontal-chart">',
      rows.map(function (row) {
        var salesPct = Math.max(2, Math.round((row.units / maxUnits) * 100));
        var adsPct = row.ads > 0 ? Math.max(2, Math.round((row.ads / maxAds) * 100)) : 0;
        return [
          '<div class="horizontal-chart-row">',
          '<span class="date">' + html(formatDate(row.date)) + '</span>',
          '<div class="horizontal-chart-track" title="' + html(row.units + ' un · ' + currency(row.revenue) + ' receita · ' + currency(row.ads) + ' Ads') + '">',
          '<i class="sales-bar" style="width:' + salesPct + '%"></i>',
          '<i class="ads-bar" style="width:' + adsPct + '%"></i>',
          '</div>',
          '<strong>' + integer(row.units) + ' un</strong>',
          '<em>' + currency(row.revenue) + '</em>',
          '</div>'
        ].join('');
      }).join(''),
      '<div class="horizontal-chart-legend"><span><i></i> Vendas</span><span><i></i> Ads</span></div>',
      '</div>'
    ].join('');
  }

  function buildHorizontalRows(context) {
    var map = new Map();
    (context.dailySales || []).forEach(function (row) {
      var key = String(row.order_date || '').slice(0, 10);
      if (!key) return;
      var current = map.get(key) || { date: key, units: 0, revenue: 0, ads: 0 };
      current.units += numberValue(row.units_sold, 0);
      current.revenue += numberValue(row.gross_revenue, 0);
      map.set(key, current);
    });
    (context.dailyAds || []).forEach(function (row) {
      var key = String(row.performance_date || '').slice(0, 10);
      if (!key) return;
      var current = map.get(key) || { date: key, units: 0, revenue: 0, ads: 0 };
      current.ads += numberValue(row.expense, 0);
      map.set(key, current);
    });
    return Array.from(map.values()).sort(function (a, b) { return b.date.localeCompare(a.date); });
  }

  function bindModalEvents(context) {
    var modal = document.getElementById('product-modal');
    if (!modal) return;
    var close = modal.querySelector('[data-close-modal]');
    if (close) close.addEventListener('click', function () { modal.remove(); state.currentModal = null; });

    modal.querySelectorAll('[data-product-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        var tabId = button.getAttribute('data-product-tab');
        modal.querySelectorAll('.tab-btn').forEach(function (btn) { btn.classList.remove('active'); });
        modal.querySelectorAll('.tab-content').forEach(function (tab) { tab.classList.remove('active'); });
        button.classList.add('active');
        var tab = modal.querySelector('#product-tab-' + tabId);
        if (tab) tab.classList.add('active');
      });
    });

    var variationSelect = document.getElementById('v2-variation-select');
    if (variationSelect) variationSelect.addEventListener('change', async function () {
      context.selectedVariation = context.variations.find(function (row) { return String(row.model_id) === String(variationSelect.value); }) || null;
      context.adsOverride = await fetchAdsOverride(context.item, context.selectedVariation, context.range);
      renderModal(context);
    });

    var periodSelect = document.getElementById('product-period-select');
    var startInput = document.getElementById('product-period-start');
    var endInput = document.getElementById('product-period-end');
    if (periodSelect) periodSelect.addEventListener('change', function () {
      var custom = periodSelect.value === 'custom';
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

    var saveAds = document.getElementById('product-save-ads-cost');
    if (saveAds) saveAds.addEventListener('click', function () { saveAdsOverride(context); });
    var adsInput = document.getElementById('product-ads-cost-input');
    if (adsInput) adsInput.addEventListener('input', function () { updateProfitBlock(context); });
  }

  async function changePeriod(context, preset, start, end) {
    context.periodPreset = preset;
    context.range = preset === 'custom' ? { start: start, end: end } : getRangeFromPreset(preset);
    await hydrateModalContext(context);
    renderModal(context);
  }

  async function saveAdsOverride(context) {
    var user = await getCurrentUser();
    if (!user) return setProductStatus('Faça login para salvar ajuste de Ads na conta.', true);
    var value = readNumber('product-ads-cost-input', 0);
    var variation = context.selectedVariation;
    var payload = {
      user_id: user.id,
      shop_id: context.item.shop_id || getSelectedShopIdOrNull() || getFirstShopIdFromSelect(),
      item_id: context.item.item_id,
      model_id: null,
      period_start: context.range.start,
      period_end: context.range.end,
      ads_cost_amount: value,
      source: 'manual',
      notes: 'Ajuste manual no Analisador de Anúncios',
      updated_at: new Date().toISOString()
    };
    var result = context.adsOverride && context.adsOverride.id
      ? await supabaseClient.from('ads_cost_overrides').update(payload).eq('id', context.adsOverride.id).eq('user_id', user.id).eq('shop_id', payload.shop_id).select('*').single()
      : await supabaseClient.from('ads_cost_overrides').insert(payload).select('*').single();
    if (result.error) return setProductStatus('Falha ao salvar Ads: ' + result.error.message, true);
    context.adsOverride = result.data;
    updateProfitBlock(context);
    setProductStatus('Custo de Ads salvo na sua conta.', false);
  }

  function updateProfitBlock(context) {
    var result = document.getElementById('product-profit-result');
    if (!result) return;
    if (context.selectedVariation) {
      result.innerHTML = [
        metric('Lucro unitário', '—'),
        metric('Margem final', '—'),
        metric('Ads por venda', '—'),
        metric('Lucro no período', '—')
      ].join('') + '<p class="ads-info-note">A Shopee fornece Ads neste fluxo por item, não por variação. Use “Produto consolidado” para calcular o lucro sem atribuir Ads incorretamente.</p>';
      return;
    }

    var finance = state.financeSettings || DEFAULT_FINANCE;
    var price = selectedPrice(context.item, null);
    var cost = selectedCost(context.item, null);
    var realAds = sumRows(context.dailyAds, 'expense');
    var adsCost = readNumber('product-ads-cost-input', context.adsOverride ? numberValue(context.adsOverride.ads_cost_amount, realAds) : realAds);
    var units = sumRows(context.dailySales, 'units_sold');

    if (units <= 0) {
      result.innerHTML = [
        metric('Lucro unitário', '—'),
        metric('Margem final', '—'),
        metric('Ads por venda', '—'),
        metric('Lucro no período', currency(-adsCost), adsCost > 0 ? 'negative' : '')
      ].join('');
      return;
    }

    var adsPerUnit = adsCost / units;
    var commission = price * (numberValue(finance.commission_percent, 0) / 100);
    var service = price * (numberValue(finance.service_fee_percent, 0) / 100);
    var tax = price * (numberValue(finance.tax_percent, 0) / 100);
    var fixed = numberValue(finance.fixed_fee_amount, 0);
    var unitProfit = price - commission - fixed - service - tax - cost - adsPerUnit;
    var margin = price > 0 ? (unitProfit / price) * 100 : 0;
    result.innerHTML = [
      metric('Lucro unitário', currency(unitProfit), unitProfit >= 0 ? 'positive' : 'negative'),
      metric('Margem final', margin.toFixed(1) + '%', margin >= 15 ? 'positive' : margin >= 0 ? 'warning' : 'negative'),
      metric('Ads por venda', currency(adsPerUnit), adsPerUnit > 0 ? 'warning' : ''),
      metric('Lucro no período', currency(unitProfit * units), unitProfit >= 0 ? 'positive' : 'negative')
    ].join('');
  }

  async function syncProductAdsFromConfig(button) {
    if (!hasSupabase()) return setFinanceStatus('Supabase não conectado.', true);
    var session = (await supabaseClient.auth.getSession()).data.session;
    if (!session) return setFinanceStatus('Faça login para sincronizar Ads.', true);
    var shopId = getSelectedShopIdOrNull();
    if (!shopId) return setFinanceStatus('Selecione ou vincule uma loja Shopee.', true);

    var original = button.innerHTML;
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
    var session = (await supabaseClient.auth.getSession()).data.session;
    if (!session) throw new Error('Usuário não autenticado.');
    var base = String(supabaseUrl || '').replace(/\/$/, '');
    var response = await fetch(base + '/functions/v1/' + PRODUCT_ADS_FUNCTION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ action: 'sync-product-ads', shop_id: Number(shopId), days: days || 30 })
    });
    var json = await response.json().catch(function () { return {}; });
    if (!response.ok || !json.ok) throw new Error(json.error || ('HTTP ' + response.status));
    return json.result;
  }

  function renderComboChart(rows) {
    var daily = consolidateSales(rows);
    if (!daily.length) return '<div class="ads-empty-block">Sem vendas no período selecionado.</div>';
    var width = 760;
    var height = 260;
    var pad = 34;
    var maxUnits = Math.max(1, Math.max.apply(null, daily.map(function (row) { return row.units; })));
    var maxRevenue = Math.max(1, Math.max.apply(null, daily.map(function (row) { return row.revenue; })));
    var barSlot = (width - pad * 2) / daily.length;
    var points = [];
    var bars = daily.map(function (row, index) {
      var x = pad + index * barSlot;
      var barHeight = (row.units / maxUnits) * (height - pad * 2);
      var y = height - pad - barHeight;
      var lineY = height - pad - ((row.revenue / maxRevenue) * (height - pad * 2));
      points.push([x + barSlot / 2, lineY].join(','));
      return '<rect x="' + (x + 2) + '" y="' + y + '" width="' + Math.max(2, barSlot - 4) + '" height="' + barHeight + '" rx="3"><title>' + html(formatDate(row.date) + ' · ' + row.units + ' un · ' + currency(row.revenue)) + '</title></rect>';
    }).join('');
    var labels = daily.filter(function (_, index) { return index === 0 || index === daily.length - 1 || index % Math.ceil(daily.length / 6) === 0; }).map(function (row) {
      var originalIndex = daily.indexOf(row);
      var x = pad + originalIndex * barSlot + barSlot / 2;
      return '<text x="' + x + '" y="' + (height - 8) + '" text-anchor="middle">' + html(formatDate(row.date)) + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Vendas e receita"><g class="combo-bars">' + bars + '</g><polyline class="combo-line" fill="none" points="' + points.join(' ') + '"></polyline><g class="combo-labels">' + labels + '</g></svg><div class="combo-legend"><span><i></i> Vendas</span><span><i></i> Receita</span></div>';
  }

  function renderAdsTable(rows) {
    if (!rows.length) return '<div class="ads-empty-block">Nenhum Ads por produto sincronizado neste período. Use o botão de sincronização em Configurações.</div>';
    return '<div class="table-container"><table class="data-table"><thead><tr><th>Data</th><th style="text-align:right">Gasto</th><th style="text-align:right">Receita direta</th><th style="text-align:right">Cliques</th><th style="text-align:right">ROAS</th></tr></thead><tbody>' + rows.map(function (row) {
      return '<tr><td>' + html(formatDate(row.performance_date)) + '</td><td style="text-align:right">' + currency(row.expense) + '</td><td style="text-align:right">' + currency(row.direct_gmv) + '</td><td style="text-align:right">' + integer(row.clicks) + '</td><td style="text-align:right">' + numberValue(row.direct_roas, numberValue(row.direct_roi, 0)).toFixed(2) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function consolidateSales(rows) {
    var map = new Map();
    (rows || []).forEach(function (row) {
      var date = String(row.order_date || '').slice(0, 10);
      if (!date) return;
      var current = map.get(date) || { date: date, units: 0, revenue: 0 };
      current.units += numberValue(row.units_sold, 0);
      current.revenue += numberValue(row.gross_revenue, 0);
      map.set(date, current);
    });
    return Array.from(map.values()).sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  function getRangeFromPreset(preset) {
    var end = new Date();
    end.setHours(0, 0, 0, 0);
    var start = new Date(end);
    var days = preset === '365' ? 365 : Number(preset || 30);
    start.setDate(end.getDate() - (days - 1));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }

  function selectedPrice(item, variation) {
    if (variation) {
      var variationPrice = firstPositive(variation.current_price, variation.discount_price, variation.model_discounted_price, variation.price_with_discount, variation.sale_price);
      if (variationPrice > 0) return variationPrice;
      var vUnits = numberValue(variation.units_sold_30d, 0);
      var vRevenue = numberValue(variation.revenue_30d, 0);
      if (vUnits > 0 && vRevenue > 0) return vRevenue / vUnits;
    }
    var itemPrice = firstPositive(item.current_price, item.discount_price, item.price_with_discount, item.sale_price);
    if (itemPrice > 0) return itemPrice;
    var units30 = numberValue(item.sales_30d, 0);
    var revenue30 = numberValue(item.revenue_30d, 0);
    return units30 > 0 && revenue30 > 0 ? revenue30 / units30 : 0;
  }

  function selectedCost(item, variation) {
    if (variation) {
      var variationCost = firstPositive(variation.upseller_average_cost, variation.average_cost, variation.unit_cost, variation.cost_price);
      if (variationCost > 0) return variationCost;
    }
    return firstPositive(item.upseller_average_cost, item.average_cost, item.unit_cost, item.cost_price);
  }

  function firstPositive() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = numberValue(arguments[i], 0);
      if (value > 0) return value;
    }
    return 0;
  }

  function getSkuLabel(item, variation) {
    if (variation) return variation.model_sku || 'Variação sem SKU';
    return item.has_model || numberValue(item.variation_count, 0) > 0 ? 'Produto com Variações' : (item.item_sku || 'Sem SKU');
  }

  function metric(label, value, tone) {
    return '<div class="ads-metric ' + html(tone || '') + '"><span>' + html(label) + '</span><strong>' + html(value) + '</strong></div>';
  }

  function roas(rows, revenueKey) {
    var expense = sumRows(rows, 'expense');
    var revenue = sumRows(rows, revenueKey);
    return expense > 0 ? (revenue / expense).toFixed(2) : '—';
  }

  function sumRows(rows, key) {
    return (rows || []).reduce(function (sum, row) { return sum + numberValue(row[key], 0); }, 0);
  }

  function normalizeImages(value, cover) {
    var parsed = parseMaybeJson(value);
    var out = [];
    if (cover) out.push(cover);
    if (Array.isArray(parsed)) parsed.forEach(function (img) {
      var url = typeof img === 'string' ? img : img && (img.url || img.image_url || img.imageUrl || img.display_image || img.thumbnail_url);
      if (url && out.indexOf(url) === -1) out.push(url);
    });
    return out;
  }

  function normalizeAttributes(value) {
    var parsed = parseMaybeJson(value);
    var attrs = Array.isArray(parsed) ? parsed : [];
    return attrs.map(function (attr, index) {
      var name = attr.display_attribute_name || attr.attribute_name || attr.name || attr.original_attribute_name || ('Atributo ' + (index + 1));
      var list = parseMaybeJson(attr.attribute_value_list || attr.values || attr.attribute_values);
      var val = '';
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
    var result = await supabaseClient.auth.getUser();
    return result.data && result.data.user ? result.data.user : null;
  }

  function getSelectedShopIdOrNull() {
    if (typeof selectedShop !== 'undefined' && selectedShop && selectedShop !== 'all') return Number(selectedShop);
    var select = document.getElementById('select-shop');
    if (select && select.value && select.value !== 'all') return Number(select.value);
    return null;
  }

  function getFirstShopIdFromSelect() {
    var select = document.getElementById('select-shop');
    if (!select) return null;
    var optionNode = Array.prototype.find.call(select.options || [], function (optionItem) {
      return optionItem.value && optionItem.value !== 'all';
    });
    return optionNode ? Number(optionNode.value) : null;
  }

  function hasSupabase() {
    return typeof supabaseClient !== 'undefined' && !!supabaseClient;
  }

  function safeImage(url) {
    if (!url) return 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=120&auto=format&fit=crop&q=60';
    try {
      var parsed = new URL(String(url), window.location.href);
      return ['http:', 'https:'].indexOf(parsed.protocol) >= 0 ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function setInput(id, value) {
    var input = document.getElementById(id);
    if (input) input.value = numberValue(value, 0).toFixed(2);
  }

  function readNumber(id, fallback) {
    var input = document.getElementById(id);
    return input ? numberValue(input.value, fallback) : fallback;
  }

  function numberValue(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback || 0;
    var num = Number(typeof value === 'string' ? value.replace(',', '.') : value);
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
    var parts = String(value || '').slice(0, 10).split('-');
    return parts.length === 3 ? parts[2] + '/' + parts[1] : String(value || '-');
  }

  function setProductStatus(message, isError) {
    var el = document.getElementById('product-modal-status');
    if (!el) return;
    el.textContent = message;
    el.className = 'product-modal-status ' + (isError ? 'error' : 'success');
  }

  function showPageMessage(message, isError) {
    var banner = document.getElementById('rls-alert-banner');
    if (!banner) return;
    banner.style.display = 'block';
    banner.className = isError ? 'ads-info-note warning' : 'ads-info-note';
    banner.textContent = message;
  }

  function html(value) {
    if (typeof escapeHTML === 'function') return escapeHTML(value);
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install);
  else install();
})();
