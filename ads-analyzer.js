// JV Imports Ads Analyzer runtime
// This file intentionally avoids auth/session changes. It only patches the Ads Analyzer UI and data reads.
(function () {
  const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=120&auto=format&fit=crop&q=60';
  const DEFAULT_FINANCE = {
    marketplace: 'shopee',
    commissionPercent: 14,
    fixedFeeAmount: 4,
    serviceFeePercent: 0,
    taxPercent: 0
  };

  const state = {
    installed: false,
    loading: false,
    products: [],
    variationsByItem: new Map(),
    dailyByItem: new Map(),
    adsByItem: new Map(),
    financeSettings: loadLocalFinanceSettings(),
    filters: {
      search: '',
      status: 'all',
      score: 'all',
      type: 'all',
      performance: 'all'
    },
    sort: {
      key: 'sales30d',
      direction: 'desc'
    },
    lastError: null
  };

  function install() {
    if (state.installed) return;
    state.installed = true;
    window.jvAdsAnalyzer = {
      refresh: refreshAnalyzer,
      render: renderAnalyzerTable,
      sort: sortBy,
      open: openProductOptimizer
    };

    patchLoadAllData();
    patchNavigation();
    window.populateListingsTable = renderAnalyzerTable;
    window.openProductOptimizer = openProductOptimizer;

    ensureToolbar();
    renderAnalyzerTable();
  }

  function patchLoadAllData() {
    if (typeof window.loadAllData !== 'function' || window.loadAllData.__adsAnalyzerPatched) return;
    const originalLoadAllData = window.loadAllData;
    const patched = async function () {
      const result = await originalLoadAllData.apply(this, arguments);
      await refreshAnalyzer({ silent: true });
      return result;
    };
    patched.__adsAnalyzerPatched = true;
    window.loadAllData = patched;
  }

  function patchNavigation() {
    if (typeof window.switchView !== 'function' || window.switchView.__adsAnalyzerPatched) return;
    const originalSwitchView = window.switchView;
    const patched = function (viewName, element) {
      const result = originalSwitchView.apply(this, arguments);
      if (viewName === 'anuncios') {
        setTimeout(function () {
          ensureToolbar();
          refreshAnalyzer({ silent: true });
        }, 0);
      }
      return result;
    };
    patched.__adsAnalyzerPatched = true;
    window.switchView = patched;
  }

  async function refreshAnalyzer(options) {
    const opts = options || {};
    ensureToolbar();
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      renderAnalyzerTable();
      return;
    }

    state.loading = true;
    state.lastError = null;
    if (!opts.silent) renderAnalyzerTable();

    try {
      await Promise.all([fetchProducts(), fetchFinanceSettings()]);
    } catch (error) {
      state.lastError = error;
      console.error('Erro ao atualizar analisador de anuncios:', error);
    } finally {
      state.loading = false;
      renderAnalyzerTable();
    }
  }

  async function fetchProducts() {
    let query = supabaseClient.from('vw_product_performance_summary').select('*');
    if (typeof selectedShop !== 'undefined' && selectedShop !== 'all') {
      query = query.eq('shop_id', Number(selectedShop));
    }
    const { data, error } = await query.order('sales_30d', { ascending: false, nullsFirst: false }).limit(1000);
    if (error) throw error;
    state.products = Array.isArray(data) ? data : [];

    try {
      productPerformanceData = state.products;
      shopeeProductsData = state.products;
    } catch (ignore) {}
  }

  async function fetchFinanceSettings() {
    const local = loadLocalFinanceSettings();
    if (local) {
      state.financeSettings = local;
      return;
    }

    const { data, error } = await supabaseClient
      .from('commerce_fee_settings')
      .select('*')
      .eq('marketplace', 'shopee')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      state.financeSettings = {
        marketplace: data.marketplace || 'shopee',
        commissionPercent: numberValue(data.commission_percent, DEFAULT_FINANCE.commissionPercent),
        fixedFeeAmount: numberValue(data.fixed_fee_amount, DEFAULT_FINANCE.fixedFeeAmount),
        serviceFeePercent: numberValue(data.service_fee_percent, DEFAULT_FINANCE.serviceFeePercent),
        taxPercent: numberValue(data.tax_percent, DEFAULT_FINANCE.taxPercent)
      };
    } else {
      state.financeSettings = DEFAULT_FINANCE;
    }
  }

  async function fetchVariations(itemId) {
    const cacheKey = String(itemId);
    if (state.variationsByItem.has(cacheKey)) return state.variationsByItem.get(cacheKey);
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return [];

    const { data, error } = await supabaseClient
      .from('vw_product_variation_performance_summary')
      .select('*')
      .eq('item_id', itemId)
      .order('units_sold_30d', { ascending: false, nullsFirst: false });

    if (error) {
      console.warn('Falha ao carregar variacoes:', error);
      state.variationsByItem.set(cacheKey, []);
      return [];
    }

    const variations = Array.isArray(data) ? data : [];
    state.variationsByItem.set(cacheKey, variations);
    return variations;
  }

  async function fetchDailySales(itemId) {
    const cacheKey = String(itemId);
    if (state.dailyByItem.has(cacheKey)) return state.dailyByItem.get(cacheKey);
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return [];

    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startIso = start.toISOString().slice(0, 10);

    const { data, error } = await supabaseClient
      .from('vw_product_performance_daily')
      .select('*')
      .eq('item_id', itemId)
      .gte('order_date', startIso)
      .order('order_date', { ascending: true });

    if (error) {
      console.warn('Falha ao carregar vendas diarias:', error);
      state.dailyByItem.set(cacheKey, []);
      return [];
    }

    const rows = Array.isArray(data) ? data : [];
    state.dailyByItem.set(cacheKey, rows);
    return rows;
  }

  async function fetchProductAds(itemId) {
    const cacheKey = String(itemId);
    if (state.adsByItem.has(cacheKey)) return state.adsByItem.get(cacheKey);
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return [];

    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startIso = start.toISOString().slice(0, 10);

    const { data, error } = await supabaseClient
      .from('shopee_ads_daily')
      .select('date, expense, direct_gmv, broad_gmv, direct_roas, broad_roas, impression, clicks')
      .eq('item_id', itemId)
      .gte('date', startIso)
      .order('date', { ascending: true });

    if (error) {
      console.warn('Falha ao carregar ads por produto:', error);
      state.adsByItem.set(cacheKey, []);
      return [];
    }

    const rows = Array.isArray(data) ? data : [];
    state.adsByItem.set(cacheKey, rows);
    return rows;
  }

  function ensureToolbar() {
    const panel = document.querySelector('#anuncios-view .panel-card');
    const table = document.getElementById('table-listings');
    if (!panel || !table) return;

    table.classList.add('ads-analyzer-table');

    const description = panel.querySelector('p');
    if (description) {
      description.textContent = 'Auditoria de performance, qualidade e margem baseada nas views consolidadas de Shopee, pedidos e UPSeller.';
    }

    if (!document.getElementById('ads-analyzer-toolbar')) {
      const toolbar = document.createElement('div');
      toolbar.id = 'ads-analyzer-toolbar';
      toolbar.className = 'ads-toolbar';
      toolbar.innerHTML = [
        '<div class="ads-search-wrap">',
        '<i data-lucide="search"></i>',
        '<input id="ads-search" type="search" placeholder="Buscar por anuncio, SKU ou ID">',
        '</div>',
        '<select id="ads-status-filter" class="select-field" title="Status do anuncio">',
        '<option value="all">Todos os status</option>',
        '<option value="active">Ativos</option>',
        '<option value="inactive">Inativos/Revisao</option>',
        '</select>',
        '<select id="ads-score-filter" class="select-field" title="Saude do anuncio">',
        '<option value="all">Todas as notas</option>',
        '<option value="excellent">Excelente</option>',
        '<option value="good">Bom</option>',
        '<option value="poor">Critico</option>',
        '</select>',
        '<select id="ads-type-filter" class="select-field" title="Tipo de produto">',
        '<option value="all">Todos os tipos</option>',
        '<option value="single">Produto unico</option>',
        '<option value="variations">Com variacoes</option>',
        '</select>',
        '<select id="ads-performance-filter" class="select-field" title="Filtro operacional">',
        '<option value="all">Toda performance</option>',
        '<option value="with-sales">Com vendas 30d</option>',
        '<option value="no-sales">Sem vendas 30d</option>',
        '<option value="missing-cost">Sem custo UPSeller</option>',
        '<option value="inactive">Inativos</option>',
        '</select>',
        '<button id="ads-refresh" class="btn-secondary ads-icon-button" title="Atualizar analisador" type="button"><i data-lucide="refresh-cw"></i></button>'
      ].join('');

      const tableContainer = panel.querySelector('.table-container');
      panel.insertBefore(toolbar, tableContainer || table);
    }

    bindToolbarEvents();
    if (window.lucide) lucide.createIcons();
  }

  function bindToolbarEvents() {
    const toolbar = document.getElementById('ads-analyzer-toolbar');
    if (!toolbar || toolbar.dataset.bound === 'true') return;
    toolbar.dataset.bound = 'true';

    const bind = function (id, eventName, handler) {
      const el = document.getElementById(id);
      if (el) el.addEventListener(eventName, handler);
    };

    bind('ads-search', 'input', function (event) {
      state.filters.search = event.target.value.trim().toLowerCase();
      renderAnalyzerTable();
    });
    bind('ads-status-filter', 'change', function (event) {
      state.filters.status = event.target.value;
      renderAnalyzerTable();
    });
    bind('ads-score-filter', 'change', function (event) {
      state.filters.score = event.target.value;
      renderAnalyzerTable();
    });
    bind('ads-type-filter', 'change', function (event) {
      state.filters.type = event.target.value;
      renderAnalyzerTable();
    });
    bind('ads-performance-filter', 'change', function (event) {
      state.filters.performance = event.target.value;
      renderAnalyzerTable();
    });
    bind('ads-refresh', 'click', function () {
      refreshAnalyzer();
    });
  }

  function renderAnalyzerTable() {
    ensureToolbar();
    const table = document.getElementById('table-listings');
    if (!table) return;

    table.innerHTML = [
      '<thead><tr>',
      sortableHeader('Nome do Anuncio', 'name', 'ads-name-col'),
      '<th>Imagem</th>',
      sortableHeader('Status', 'status'),
      sortableHeader('Tipo / SKU', 'type'),
      sortableHeader('Vendas 30d / Total', 'sales30d', 'numeric'),
      sortableHeader('Receita 30d', 'revenue30d', 'numeric'),
      sortableHeader('Visualizacoes', 'views', 'numeric'),
      sortableHeader('Conversao', 'conversion', 'numeric'),
      sortableHeader('Nota', 'rating', 'numeric'),
      sortableHeader('Listing Score', 'score'),
      '<th>Otimizacoes Recomendadas</th>',
      '</tr></thead><tbody id="listings-tbody"></tbody>'
    ].join('');

    const tbody = document.getElementById('listings-tbody');
    if (!tbody) return;

    if (state.loading && state.products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-placeholder"><i data-lucide="loader-2" class="spin"></i><p>Atualizando auditoria de anuncios...</p></td></tr>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (state.lastError) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-placeholder" style="color: hsl(var(--color-danger));"><i data-lucide="alert-triangle"></i><h3>Falha ao carregar o Analisador</h3><p>' + html(state.lastError.message || 'Erro desconhecido') + '</p></td></tr>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    const rows = getFilteredProducts();
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-placeholder">Nenhum anuncio encontrado para os filtros selecionados.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(renderListingRow).join('');
    tbody.querySelectorAll('tr[data-item-id]').forEach(function (row) {
      row.addEventListener('click', function () {
        openProductOptimizer(row.getAttribute('data-item-id'), row.getAttribute('data-shop-id'));
      });
    });

    if (window.lucide) lucide.createIcons();
  }

  function sortableHeader(label, key, extraClass) {
    const active = state.sort.key === key;
    const icon = active ? (state.sort.direction === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down';
    return '<th class="sortable ' + html(extraClass || '') + '" onclick="window.jvAdsAnalyzer.sort(\'' + key + '\')">' +
      '<span>' + html(label) + '</span><i data-lucide="' + icon + '"></i></th>';
  }

  function sortBy(key) {
    if (state.sort.key === key) {
      state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort.key = key;
      state.sort.direction = key === 'name' ? 'asc' : 'desc';
    }
    renderAnalyzerTable();
  }

  function getFilteredProducts() {
    const search = state.filters.search;
    const rows = state.products.filter(function (item) {
      const score = getListingScore(item);
      const meta = getListingScoreMeta(score.value);
      const hasVariations = hasProductVariations(item);
      const active = isActiveProduct(item);
      const sales30d = numberValue(item.sales_30d, 0);
      const cost = numberValue(item.upseller_average_cost, 0);

      if (search) {
        const haystack = [item.item_name, item.item_sku, item.item_id].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (state.filters.status === 'active' && !active) return false;
      if (state.filters.status === 'inactive' && active) return false;
      if (state.filters.score !== 'all' && meta.className !== state.filters.score) return false;
      if (state.filters.type === 'single' && hasVariations) return false;
      if (state.filters.type === 'variations' && !hasVariations) return false;
      if (state.filters.performance === 'with-sales' && sales30d <= 0) return false;
      if (state.filters.performance === 'no-sales' && sales30d > 0) return false;
      if (state.filters.performance === 'missing-cost' && cost > 0) return false;
      if (state.filters.performance === 'inactive' && active) return false;
      return true;
    });

    rows.sort(function (a, b) {
      const av = getSortValue(a, state.sort.key);
      const bv = getSortValue(b, state.sort.key);
      if (typeof av === 'string' || typeof bv === 'string') {
        return state.sort.direction === 'asc'
          ? String(av).localeCompare(String(bv), 'pt-BR')
          : String(bv).localeCompare(String(av), 'pt-BR');
      }
      return state.sort.direction === 'asc' ? av - bv : bv - av;
    });

    return rows;
  }

  function getSortValue(item, key) {
    const score = getListingScore(item).value;
    const views = numberValue(item.views, 0);
    const sales = numberValue(item.sales, 0);
    const conversion = views > 0 ? (sales / views) * 100 : 0;
    const map = {
      name: item.item_name || '',
      status: statusLabel(item),
      type: hasProductVariations(item) ? 'Produto com Variacoes' : (item.item_sku || ''),
      sales30d: numberValue(item.sales_30d, 0),
      revenue30d: numberValue(item.revenue_30d, 0),
      views: views,
      conversion: conversion,
      rating: numberValue(item.rating_star, 0),
      score: score
    };
    return map[key] !== undefined ? map[key] : 0;
  }

  function renderListingRow(item) {
    const score = getListingScore(item);
    const meta = getListingScoreMeta(score.value);
    const active = isActiveProduct(item);
    const views = numberValue(item.views, 0);
    const sales = numberValue(item.sales, 0);
    const sales30d = numberValue(item.sales_30d, 0);
    const conversion = views > 0 ? ((sales / views) * 100) : null;
    const rating = numberValue(item.rating_star, 0);
    const hasVariations = hasProductVariations(item);
    const skuText = hasVariations ? 'Produto com Variacoes' : (item.item_sku || 'Sem SKU');
    const recommendations = score.recommendations.length ? score.recommendations.slice(0, 3).join(' · ') : 'Excelente. Manter acompanhamento.';

    return [
      '<tr data-item-id="' + html(item.item_id) + '" data-shop-id="' + html(item.shop_id || '') + '" class="ads-clickable-row">',
      '<td class="ads-name-cell"><div class="ads-product-title">' + html(item.item_name || 'Anuncio sem titulo') + '</div><div class="ads-product-meta">ID ' + html(item.item_id || '-') + '</div></td>',
      '<td><img class="ads-product-image" src="' + html(safeImage(item.image_url)) + '" alt="Capa do anuncio"></td>',
      '<td><span class="score-pill ' + (active ? 'excellent' : 'poor') + '">' + html(statusLabel(item)) + '</span></td>',
      '<td><span class="ads-sku-chip ' + (hasVariations ? 'muted' : '') + '">' + html(skuText) + '</span></td>',
      '<td class="numeric"><strong>' + integer(sales30d) + '</strong><span class="ads-muted"> / ' + integer(sales) + '</span></td>',
      '<td class="numeric">' + currency(numberValue(item.revenue_30d, 0)) + '</td>',
      '<td class="numeric">' + integer(views) + '</td>',
      '<td class="numeric">' + (conversion === null ? '—' : percent(conversion)) + '</td>',
      '<td class="numeric ads-rating"><i data-lucide="star"></i>' + rating.toFixed(1) + '</td>',
      '<td><span class="score-pill ' + meta.className + '">' + score.value + '% ' + html(meta.label) + '</span></td>',
      '<td><span class="ads-recommendation ' + meta.className + '">' + html(recommendations) + '</span></td>',
      '</tr>'
    ].join('');
  }

  async function openProductOptimizer(itemId) {
    let item = state.products.find(function (p) { return String(p.item_id) === String(itemId); });
    if (!item && typeof shopeeProductsData !== 'undefined') {
      item = shopeeProductsData.find(function (p) { return String(p.item_id) === String(itemId); });
    }
    if (!item) {
      console.warn('Produto nao encontrado no analisador:', itemId);
      return;
    }

    const [variations, dailySales, adsRows] = await Promise.all([
      fetchVariations(item.item_id),
      fetchDailySales(item.item_id),
      fetchProductAds(item.item_id)
    ]);

    renderProductModal(item, variations, dailySales, adsRows);
  }

  function renderProductModal(item, variations, dailySales, adsRows) {
    const existing = document.getElementById('product-modal');
    if (existing) existing.remove();

    const selectedVariation = getDefaultVariation(item, variations);
    const score = getListingScore(item);
    const meta = getListingScoreMeta(score.value);
    const active = isActiveProduct(item);

    const modal = document.createElement('div');
    modal.id = 'product-modal';
    modal.className = 'modal-overlay jv-product-modal';
    modal.innerHTML = [
      '<div class="modal-content ads-modal-content">',
      '<div class="modal-header ads-modal-header">',
      '<div><h3>' + html(item.item_name || 'Produto sem titulo') + '</h3><p>' + html(statusLabel(item)) + ' · ' + (hasProductVariations(item) ? 'Produto com variacoes' : html(item.item_sku || 'Sem SKU')) + '</p></div>',
      '<button class="modal-close" type="button" data-close-modal><i data-lucide="x"></i></button>',
      '</div>',
      '<div class="modal-tabs ads-tabs">',
      tabButton('overview', 'Visao geral', true),
      tabButton('diagnosis', 'Smart Diagnosis'),
      tabButton('media', 'Midia & Atributos'),
      tabButton('sales', 'Vendas & Ads'),
      tabButton('finance', 'Config. Financeiras'),
      '</div>',
      '<div class="modal-body ads-modal-body">',
      renderOverviewTab(item, variations, selectedVariation, score, meta, active),
      renderDiagnosisTab(item, score, dailySales, adsRows),
      renderMediaTab(item),
      renderSalesTab(item, dailySales, adsRows),
      renderFinanceTab(item),
      '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);
    bindModalEvents(item, variations, dailySales, adsRows);
    updateFinancialCalculator(item, selectedVariation);
    modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  }

  function tabButton(id, label, active) {
    return '<button class="tab-btn ' + (active ? 'active' : '') + '" type="button" data-ads-tab="' + id + '">' + html(label) + '</button>';
  }

  function renderOverviewTab(item, variations, selectedVariation, score, meta, active) {
    const hasVariations = variations.length > 0;
    const selector = hasVariations
      ? '<div class="form-group ads-variation-select"><label>Variacao analisada</label><select id="ads-variation-select" class="select-field">' + variations.map(function (variation) {
          const label = [variation.model_name || 'Variacao', variation.model_sku || 'Sem SKU'].join(' · ');
          return '<option value="' + html(variation.model_id) + '">' + html(label) + '</option>';
        }).join('') + '</select></div>'
      : '<div class="ads-info-note">Produto unico: o SKU exibido e usado no calculo financeiro.</div>';

    return [
      '<section id="ads-tab-overview" class="tab-content active">',
      '<div class="ads-overview-grid">',
      '<div class="ads-product-hero">',
      '<img src="' + html(safeImage(item.image_url)) + '" alt="Imagem do produto">',
      '<div><span class="score-pill ' + meta.className + '">' + score.value + '% ' + html(meta.label) + '</span>',
      '<h4>' + html(item.item_name || 'Produto sem titulo') + '</h4>',
      '<p>' + html(active ? 'Anuncio ativo na Shopee' : 'Anuncio inativo ou em revisao') + '</p>',
      selector,
      '</div></div>',
      '<div class="ads-kpi-grid">',
      metricCard('Vendas 7d', integer(numberValue(item.sales_7d, 0))),
      metricCard('Vendas 15d', integer(numberValue(item.sales_15d, 0))),
      metricCard('Vendas 30d', integer(numberValue(item.sales_30d, 0))),
      metricCard('Receita 30d', currency(numberValue(item.revenue_30d, 0))),
      '</div>',
      '</div>',
      '<div class="ads-finance-card">',
      '<div class="ads-section-title"><h4>Lucro final estimado</h4><span>Taxas Shopee, Ads, imposto e custo UPSeller</span></div>',
      '<div class="ads-finance-inputs">',
      financeInput('ads-price-input', 'Preco venda', selectedPrice(item, selectedVariation)),
      financeInput('ads-cost-input', 'Custo produto', selectedCost(item, selectedVariation)),
      financeInput('ads-ads-input', 'Ads 30d manual', getManualAdsCost(item.item_id, selectedVariation ? selectedVariation.model_id : null)),
      financeInput('ads-units-input', 'Unidades 30d', selectedUnits30(item, selectedVariation), '1'),
      '</div>',
      '<div id="ads-finance-result" class="ads-finance-result"></div>',
      '</div>',
      '</section>'
    ].join('');
  }

  function renderDiagnosisTab(item, score, dailySales, adsRows) {
    const insights = buildDiagnosis(item, score, dailySales, adsRows);
    return [
      '<section id="ads-tab-diagnosis" class="tab-content">',
      '<div class="ads-section-title"><h4>Smart Diagnosis</h4><span>Leitura operacional com base em vendas, qualidade, custo e midia</span></div>',
      '<div class="ads-diagnosis-grid">',
      insights.map(function (insight) {
        return '<div class="ads-diagnosis-card ' + insight.level + '"><div><span>' + html(insight.area) + '</span><strong>' + html(insight.title) + '</strong></div><p>' + html(insight.body) + '</p><small>' + html(insight.action) + '</small></div>';
      }).join(''),
      '</div>',
      '</section>'
    ].join('');
  }

  function renderMediaTab(item) {
    const images = normalizeImages(item.images_json, item.image_url);
    const attrs = normalizeAttributes(item.attributes_json);
    const video = normalizeVideo(item.video_info_json);

    return [
      '<section id="ads-tab-media" class="tab-content">',
      '<div class="ads-section-title"><h4>Midia do anuncio</h4><span>' + images.length + ' imagem(ns) sincronizada(s)</span></div>',
      '<div class="ads-media-grid">',
      images.map(function (url) {
        return '<div class="ads-media-item"><img src="' + html(safeImage(url)) + '" alt="Imagem do anuncio"><span>Imagem sincronizada</span></div>';
      }).join('') || '<div class="ads-empty-block">Nenhuma imagem sincronizada.</div>',
      '</div>',
      '<div class="ads-section-title"><h4>Video</h4><span>' + (video ? 'Cadastrado' : 'Nao encontrado') + '</span></div>',
      video ? '<div class="ads-info-note">Video encontrado nos dados sincronizados. Abra o painel da Shopee para conferir duracao e qualidade final.</div>' : '<div class="ads-empty-block">Sem video cadastrado ou nao sincronizado.</div>',
      '<div class="ads-section-title"><h4>Ficha Tecnica (Atributos)</h4><span>' + attrs.length + ' atributo(s)</span></div>',
      '<div class="ads-attributes-grid">',
      attrs.map(function (attr) {
        return '<div class="attr-item"><span>' + html(attr.name) + '</span><strong>' + html(attr.value) + '</strong></div>';
      }).join('') || '<div class="ads-empty-block">Nenhum atributo sincronizado. Reexecute a sincronizacao de produtos para preencher a ficha tecnica.</div>',
      '</div>',
      '</section>'
    ].join('');
  }

  function renderSalesTab(item, dailySales, adsRows) {
    const daily = consolidateDailySales(dailySales);
    const totalUnits = daily.reduce(function (sum, row) { return sum + row.units; }, 0);
    const totalRevenue = daily.reduce(function (sum, row) { return sum + row.revenue; }, 0);
    const adsExpense = adsRows.reduce(function (sum, row) { return sum + numberValue(row.expense, 0); }, 0);
    const adsRevenue = adsRows.reduce(function (sum, row) { return sum + numberValue(row.direct_gmv, 0) + numberValue(row.broad_gmv, 0); }, 0);
    const roas = adsExpense > 0 ? adsRevenue / adsExpense : null;

    return [
      '<section id="ads-tab-sales" class="tab-content">',
      '<div class="ads-kpi-grid ads-kpi-compact">',
      metricCard('Vendas organicas 30d', integer(totalUnits)),
      metricCard('Receita organica 30d', currency(totalRevenue)),
      metricCard('Ads produto 30d', adsRows.length ? currency(adsExpense) : '—'),
      metricCard('ROAS produto', roas === null ? '—' : roas.toFixed(2)),
      '</div>',
      '<div class="ads-section-title"><h4>Historico de vendas</h4><span>Ultimos 30 dias com pedidos encontrados</span></div>',
      renderBars(daily, 'units', 'order_date'),
      '<div class="ads-section-title"><h4>Performance de Ads</h4><span>' + (adsRows.length ? 'Dados por produto encontrados' : 'Granularidade por produto indisponivel') + '</span></div>',
      adsRows.length ? renderBars(adsRows.map(function (row) { return { date: row.date, expense: numberValue(row.expense, 0) }; }), 'expense', 'date') : '<div class="ads-info-note warning">Os dados atuais de Shopee Ads estao consolidados e nao possuem item_id para a maioria dos registros. Por isso o sistema nao inventa vendas/Ads por produto; este bloco fica vazio ate a Edge Function sincronizar campanhas/anuncios com granularidade por item.</div>',
      '</section>'
    ].join('');
  }

  function renderFinanceTab(item) {
    const finance = state.financeSettings || DEFAULT_FINANCE;
    return [
      '<section id="ads-tab-finance" class="tab-content">',
      '<div class="ads-section-title"><h4>Configuracoes financeiras</h4><span>Aplicadas ao calculo de lucro do produto aberto</span></div>',
      '<div class="ads-settings-grid">',
      financeInput('ads-setting-commission', 'Comissao Shopee %', finance.commissionPercent),
      financeInput('ads-setting-fixed', 'Taxa fixa Shopee R$', finance.fixedFeeAmount),
      financeInput('ads-setting-service', 'Taxa servico %', finance.serviceFeePercent),
      financeInput('ads-setting-tax', 'Imposto %', finance.taxPercent),
      '</div>',
      '<button id="ads-save-finance-settings" class="btn-primary ads-save-settings" type="button">Salvar configuracoes neste navegador</button>',
      '<div class="ads-info-note">A estrutura no Supabase ja existe para persistencia central. Nesta rodada, para nao mexer em auth/RLS, a edicao fica local no navegador.</div>',
      '</section>'
    ].join('');
  }

  function bindModalEvents(item, variations, dailySales, adsRows) {
    const modal = document.getElementById('product-modal');
    if (!modal) return;

    modal.querySelector('[data-close-modal]').addEventListener('click', function () {
      modal.remove();
    });

    modal.querySelectorAll('[data-ads-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        const tabId = button.getAttribute('data-ads-tab');
        modal.querySelectorAll('.tab-btn').forEach(function (btn) { btn.classList.remove('active'); });
        modal.querySelectorAll('.tab-content').forEach(function (tab) { tab.classList.remove('active'); });
        button.classList.add('active');
        const tab = modal.querySelector('#ads-tab-' + tabId);
        if (tab) tab.classList.add('active');
      });
    });

    const variationSelect = document.getElementById('ads-variation-select');
    if (variationSelect) {
      variationSelect.addEventListener('change', function () {
        const selected = variations.find(function (variation) { return String(variation.model_id) === String(variationSelect.value); }) || null;
        document.getElementById('ads-price-input').value = selectedPrice(item, selected).toFixed(2);
        document.getElementById('ads-cost-input').value = selectedCost(item, selected).toFixed(2);
        document.getElementById('ads-units-input').value = selectedUnits30(item, selected);
        document.getElementById('ads-ads-input').value = getManualAdsCost(item.item_id, selected ? selected.model_id : null).toFixed(2);
        updateFinancialCalculator(item, selected);
      });
    }

    ['ads-price-input', 'ads-cost-input', 'ads-ads-input', 'ads-units-input'].forEach(function (id) {
      const input = document.getElementById(id);
      if (input) input.addEventListener('input', function () {
        const selected = getSelectedVariation(variations);
        saveManualOverrides(item.item_id, selected ? selected.model_id : null);
        updateFinancialCalculator(item, selected);
      });
    });

    const saveSettings = document.getElementById('ads-save-finance-settings');
    if (saveSettings) {
      saveSettings.addEventListener('click', function () {
        state.financeSettings = {
          marketplace: 'shopee',
          commissionPercent: readNumberInput('ads-setting-commission', DEFAULT_FINANCE.commissionPercent),
          fixedFeeAmount: readNumberInput('ads-setting-fixed', DEFAULT_FINANCE.fixedFeeAmount),
          serviceFeePercent: readNumberInput('ads-setting-service', DEFAULT_FINANCE.serviceFeePercent),
          taxPercent: readNumberInput('ads-setting-tax', DEFAULT_FINANCE.taxPercent)
        };
        localStorage.setItem('jv_ads_finance_settings', JSON.stringify(state.financeSettings));
        const selected = getSelectedVariation(variations);
        updateFinancialCalculator(item, selected);
        saveSettings.textContent = 'Configuracoes salvas';
        setTimeout(function () { saveSettings.textContent = 'Salvar configuracoes neste navegador'; }, 1800);
      });
    }
  }

  function updateFinancialCalculator(item, variation) {
    const result = document.getElementById('ads-finance-result');
    if (!result) return;

    const finance = state.financeSettings || DEFAULT_FINANCE;
    const price = readNumberInput('ads-price-input', selectedPrice(item, variation));
    const productCost = readNumberInput('ads-cost-input', selectedCost(item, variation));
    const adsCost30d = readNumberInput('ads-ads-input', getManualAdsCost(item.item_id, variation ? variation.model_id : null));
    const units30d = Math.max(readNumberInput('ads-units-input', selectedUnits30(item, variation)), 0);
    const commission = price * (numberValue(finance.commissionPercent, 0) / 100);
    const serviceFee = price * (numberValue(finance.serviceFeePercent, 0) / 100);
    const tax = price * (numberValue(finance.taxPercent, 0) / 100);
    const fixedFee = numberValue(finance.fixedFeeAmount, 0);
    const adsPerUnit = units30d > 0 ? adsCost30d / units30d : 0;
    const profitUnit = price - commission - fixedFee - serviceFee - tax - productCost - adsPerUnit;
    const margin = price > 0 ? (profitUnit / price) * 100 : 0;
    const profit30d = profitUnit * units30d;

    result.innerHTML = [
      metricCard('Lucro unitario', currency(profitUnit), profitUnit >= 0 ? 'positive' : 'negative'),
      metricCard('Margem final', percent(margin), margin >= 15 ? 'positive' : margin >= 0 ? 'warning' : 'negative'),
      metricCard('Lucro 30d estimado', currency(profit30d), profit30d >= 0 ? 'positive' : 'negative'),
      metricCard('Ads por unidade', currency(adsPerUnit), adsPerUnit > 0 ? 'warning' : '')
    ].join('');
  }

  function buildDiagnosis(item, score, dailySales, adsRows) {
    const sales30 = numberValue(item.sales_30d, 0);
    const revenue30 = numberValue(item.revenue_30d, 0);
    const views = numberValue(item.views, 0);
    const conversion = views > 0 ? (numberValue(item.sales, 0) / views) * 100 : null;
    const rating = numberValue(item.rating_star, 0);
    const cost = numberValue(item.upseller_average_cost, 0);
    const attrs = normalizeAttributes(item.attributes_json);
    const images = normalizeImages(item.images_json, item.image_url);
    const insights = [];

    insights.push({
      level: sales30 > 0 ? 'good' : 'warning',
      area: 'Demanda',
      title: sales30 > 0 ? integer(sales30) + ' vendas nos ultimos 30 dias' : 'Sem venda recente',
      body: revenue30 > 0 ? 'Receita de ' + currency(revenue30) + ' no periodo, usando pedidos reais.' : 'Nao ha receita recente para este item na view consolidada.',
      action: sales30 > 0 ? 'Priorize margem, estoque e Ads.' : 'Revisar preco, foto principal e ranqueamento antes de investir Ads.'
    });

    insights.push({
      level: score.value >= 80 ? 'good' : score.value >= 60 ? 'warning' : 'danger',
      area: 'Listing Score',
      title: score.value + '% - ' + getListingScoreMeta(score.value).label,
      body: score.recommendations.length ? score.recommendations.join(' · ') : 'Anuncio sem falhas criticas detectadas.',
      action: 'Resolver primeiro os pontos que afetam conversao: capa, atributos, nota e status.'
    });

    insights.push({
      level: cost > 0 ? 'good' : 'warning',
      area: 'Custo',
      title: cost > 0 ? 'Custo UPSeller encontrado' : 'Custo ausente',
      body: cost > 0 ? 'Custo medio atual: ' + currency(cost) + '.' : 'Sem custo medio conectado, o lucro final pode ficar incompleto.',
      action: cost > 0 ? 'Validar se o custo e landed cost real.' : 'Atualizar UPSeller ou configurar override de custo.'
    });

    insights.push({
      level: images.length >= 3 ? 'good' : 'warning',
      area: 'Midia',
      title: images.length + ' imagem(ns)',
      body: attrs.length + ' atributo(s) de ficha tecnica sincronizado(s).',
      action: images.length >= 3 && attrs.length > 0 ? 'Manter padrao e testar capa alternativa.' : 'Completar imagens e atributos obrigatorios.'
    });

    insights.push({
      level: adsRows.length ? 'good' : 'warning',
      area: 'Ads',
      title: adsRows.length ? 'Ads por produto encontrado' : 'Ads por produto indisponivel',
      body: adsRows.length ? 'Ha linhas de Ads com item_id para este produto.' : 'A base atual de Ads esta majoritariamente consolidada, sem granularidade por item.',
      action: adsRows.length ? 'Comparar ROAS com lucro final.' : 'Ajustar Edge Function de Ads para sincronizar campanhas/anuncios por item.'
    });

    if (conversion !== null) {
      insights.push({
        level: conversion >= 1.5 ? 'good' : 'warning',
        area: 'Conversao',
        title: percent(conversion) + ' visitas para venda',
        body: 'Conversao calculada com vendas e visualizacoes acumuladas do anuncio.',
        action: conversion >= 1.5 ? 'Escalar trafego com cautela.' : 'Melhorar oferta, prova visual e competitividade de preco.'
      });
    }

    return insights;
  }

  function getListingScore(item) {
    let score = 35;
    const recommendations = [];
    const active = isActiveProduct(item);
    const rating = numberValue(item.rating_star, 0);
    const ratingCount = numberValue(item.rating_count, 0);
    const sales30 = numberValue(item.sales_30d, 0);
    const views = numberValue(item.views, 0);
    const sales = numberValue(item.sales, 0);
    const conversion = views > 0 ? (sales / views) * 100 : null;
    const images = normalizeImages(item.images_json, item.image_url);
    const attrs = normalizeAttributes(item.attributes_json);
    const cost = numberValue(item.upseller_average_cost, 0);

    if (item.image_url) score += 15; else recommendations.push('Adicionar imagem de capa');
    if (images.length >= 3) score += 5; else recommendations.push('Ampliar galeria de fotos');
    if (rating >= 4.7 && ratingCount > 0) score += 15;
    else if (rating >= 4.5) score += 12;
    else if (rating > 0) { score += 6; recommendations.push('Investigar avaliacoes abaixo de 4.5'); }
    else recommendations.push('Produto sem avaliacao sincronizada');
    if (sales30 > 0) score += 15; else recommendations.push('Sem vendas nos ultimos 30 dias');
    if (conversion !== null && conversion >= 1.5) score += 8;
    else if (views > 0) recommendations.push('Conversao baixa frente as visualizacoes');
    if (active) score += 10; else recommendations.push('Anuncio nao esta ativo');
    if (attrs.length > 0) score += 7; else recommendations.push('Ficha tecnica sem atributos');
    if (cost > 0) score += 5; else recommendations.push('Custo UPSeller ausente');

    return {
      value: Math.max(0, Math.min(100, Math.round(score))),
      recommendations: recommendations
    };
  }

  function getListingScoreMeta(score) {
    if (score >= 80) return { label: 'Excelente', className: 'excellent' };
    if (score >= 60) return { label: 'Bom', className: 'good' };
    return { label: 'Critico', className: 'poor' };
  }

  function hasProductVariations(item) {
    return item.has_model === true || numberValue(item.variation_count, 0) > 0;
  }

  function isActiveProduct(item) {
    const status = String(item.item_status || '').toUpperCase();
    return ['NORMAL', 'ACTIVE', 'LISTED', 'LIVE'].includes(status);
  }

  function statusLabel(item) {
    const status = String(item.item_status || '').toUpperCase();
    if (['NORMAL', 'ACTIVE', 'LISTED', 'LIVE'].includes(status)) return 'Ativo';
    if (!status) return 'Sem status';
    if (status === 'BANNED') return 'Bloqueado';
    if (status === 'UNLIST') return 'Inativo';
    if (status === 'REVIEWING') return 'Em revisao';
    return status.charAt(0) + status.slice(1).toLowerCase();
  }

  function getDefaultVariation(item, variations) {
    if (!variations || variations.length === 0) return null;
    return variations[0];
  }

  function getSelectedVariation(variations) {
    const select = document.getElementById('ads-variation-select');
    if (!select) return null;
    return variations.find(function (variation) { return String(variation.model_id) === String(select.value); }) || null;
  }

  function selectedPrice(item, variation) {
    if (variation) {
      const price = numberValue(variation.current_price, 0);
      if (price > 0) return price;
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
    const manual = getManualProductCost(item.item_id, variation ? variation.model_id : null);
    if (manual > 0) return manual;
    if (variation && numberValue(variation.upseller_average_cost, 0) > 0) return numberValue(variation.upseller_average_cost, 0);
    return numberValue(item.upseller_average_cost, 0);
  }

  function selectedUnits30(item, variation) {
    if (variation) return numberValue(variation.units_sold_30d, 0);
    return numberValue(item.sales_30d, 0);
  }

  function saveManualOverrides(itemId, modelId) {
    const cost = readNumberInput('ads-cost-input', 0);
    const ads = readNumberInput('ads-ads-input', 0);
    localStorage.setItem(overrideKey('cost', itemId, modelId), String(cost));
    localStorage.setItem(overrideKey('ads', itemId, modelId), String(ads));
  }

  function getManualProductCost(itemId, modelId) {
    return numberValue(localStorage.getItem(overrideKey('cost', itemId, modelId)), 0);
  }

  function getManualAdsCost(itemId, modelId) {
    return numberValue(localStorage.getItem(overrideKey('ads', itemId, modelId)), 0);
  }

  function overrideKey(type, itemId, modelId) {
    return 'jv_ads_' + type + '_' + itemId + '_' + (modelId || 'product');
  }

  function normalizeImages(value, cover) {
    const arr = parseMaybeJson(value);
    const out = [];
    if (cover) out.push(cover);
    if (Array.isArray(arr)) {
      arr.forEach(function (img) {
        const url = typeof img === 'string' ? img : (img && (img.url || img.image_url || img.imageUrl));
        if (url && !out.includes(url)) out.push(url);
      });
    }
    return out.filter(Boolean);
  }

  function normalizeVideo(value) {
    const parsed = parseMaybeJson(value);
    if (Array.isArray(parsed)) return parsed[0] || null;
    return parsed || null;
  }

  function normalizeAttributes(value) {
    const parsed = parseMaybeJson(value);
    const attrs = Array.isArray(parsed) ? parsed : [];
    return attrs.map(function (attr, index) {
      const name = attr.display_attribute_name || attr.attribute_name || attr.name || attr.original_attribute_name || ('Atributo ' + (index + 1));
      const valueList = parseMaybeJson(attr.attribute_value_list || attr.values || attr.attribute_values);
      let value = '';
      if (Array.isArray(valueList) && valueList.length > 0) {
        value = valueList.map(function (entry) {
          if (entry === null || entry === undefined) return '';
          if (typeof entry !== 'object') return String(entry);
          return entry.display_value_name || entry.value_name || entry.original_value_name || entry.name || entry.value || entry.display_name || '';
        }).filter(Boolean).join(', ');
      }
      if (!value) {
        value = attr.display_value_name || attr.value_name || attr.original_value_name || attr.value || attr.attribute_value || 'Nao informado';
      }
      return { name: String(name || 'Atributo'), value: String(value || 'Nao informado') };
    }).filter(function (attr) {
      return attr.name !== 'undefined' && attr.value !== 'undefined';
    });
  }

  function consolidateDailySales(rows) {
    const map = new Map();
    rows.forEach(function (row) {
      const date = String(row.order_date || '').slice(0, 10);
      if (!date) return;
      const current = map.get(date) || { order_date: date, units: 0, revenue: 0 };
      current.units += numberValue(row.units_sold, 0);
      current.revenue += numberValue(row.gross_revenue, 0);
      map.set(date, current);
    });
    return Array.from(map.values()).sort(function (a, b) { return a.order_date.localeCompare(b.order_date); });
  }

  function renderBars(rows, valueKey, dateKey) {
    if (!rows || rows.length === 0) return '<div class="ads-empty-block">Sem dados para exibir no periodo.</div>';
    const max = Math.max.apply(null, rows.map(function (row) { return numberValue(row[valueKey], 0); })) || 1;
    return '<div class="ads-bars">' + rows.map(function (row) {
      const value = numberValue(row[valueKey], 0);
      const width = Math.max(3, Math.round((value / max) * 100));
      const label = formatShortDate(row[dateKey]);
      return '<div class="ads-bar-row"><span>' + html(label) + '</span><div><i style="width:' + width + '%"></i></div><strong>' + (valueKey === 'expense' ? currency(value) : integer(value)) + '</strong></div>';
    }).join('') + '</div>';
  }

  function metricCard(label, value, tone) {
    return '<div class="ads-metric ' + html(tone || '') + '"><span>' + html(label) + '</span><strong>' + html(value) + '</strong></div>';
  }

  function financeInput(id, label, value, step) {
    return '<label class="ads-number-field"><span>' + html(label) + '</span><input id="' + html(id) + '" type="number" min="0" step="' + html(step || '0.01') + '" value="' + html(numberValue(value, 0).toFixed(step === '1' ? 0 : 2)) + '"></label>';
  }

  function loadLocalFinanceSettings() {
    try {
      const raw = localStorage.getItem('jv_ads_finance_settings');
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function parseMaybeJson(value) {
    if (!value) return Array.isArray(value) ? value : null;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (error) { return value; }
    }
    return value;
  }

  function readNumberInput(id, fallback) {
    const input = document.getElementById(id);
    return input ? numberValue(input.value, fallback) : fallback;
  }

  function numberValue(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback || 0;
    const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : (fallback || 0);
  }

  function currency(value) {
    if (typeof formatCurrency === 'function') return formatCurrency(numberValue(value, 0));
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numberValue(value, 0));
  }

  function integer(value) {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(numberValue(value, 0));
  }

  function percent(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return numberValue(value, 0).toFixed(1) + '%';
  }

  function formatShortDate(dateValue) {
    const parts = String(dateValue || '').slice(0, 10).split('-');
    return parts.length === 3 ? parts[2] + '/' + parts[1] : String(dateValue || '-');
  }

  function safeImage(url) {
    if (!url) return FALLBACK_IMAGE;
    try {
      const parsed = new URL(String(url), window.location.href);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : FALLBACK_IMAGE;
    } catch (error) {
      return FALLBACK_IMAGE;
    }
  }

  function html(value) {
    if (typeof escapeHTML === 'function') return escapeHTML(value);
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();
