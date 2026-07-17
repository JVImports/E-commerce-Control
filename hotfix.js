(function () {
  'use strict';

  var PERIOD_OPTIONS = [
    { value: 'today', label: 'Hoje' },
    { value: 'yesterday', label: 'Ontem' },
    { value: 'before_yesterday', label: 'Anteontem' },
    { value: '7', label: 'Última semana' },
    { value: '15', label: 'Últimos 15 dias' },
    { value: '30', label: 'Último mês' },
    { value: '90', label: 'Últimos 90 dias' },
    { value: 'year', label: 'Ano atual' },
    { value: 'prev_year', label: 'Ano anterior' },
    { value: 'all', label: 'Todo o Histórico' }
  ];

  var commerceSalesDaily = [];
  var commerceAdsDaily = [];
  var commercePatchInstalled = false;

  function patchSupabaseFinancialHistoryLimit() {
    if (!window.supabase || window.supabase.__jvFinancialPatchApplied) return;

    var originalCreateClient = window.supabase.createClient;
    if (typeof originalCreateClient !== 'function') return;

    window.supabase.createClient = function () {
      var client = originalCreateClient.apply(window.supabase, arguments);
      var originalFrom = client.from.bind(client);

      client.from = function (tableName) {
        var query = originalFrom(tableName);

        if (tableName === 'vw_financial_daily' && query && typeof query.limit === 'function') {
          var originalLimit = query.limit.bind(query);
          query.limit = function (count, options) {
            if (Number(count) === 365) return query;
            return originalLimit(count, options);
          };
        }

        return query;
      };

      return client;
    };

    window.supabase.__jvFinancialPatchApplied = true;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
  }

  function dash() {
    return '—';
  }

  function getClient() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e) {}
    return window.supabaseClient || null;
  }

  function getSelectedPeriodValue() {
    var select = byId('select-period');
    if (select && select.value) return select.value;
    try {
      if (typeof selectedPeriod !== 'undefined') return selectedPeriod;
    } catch (e) {}
    return '30';
  }

  function setSelectedPeriodValue(value) {
    try { window.selectedPeriod = value; } catch (e) {}
    try { selectedPeriod = value; } catch (e) {}
  }

  function getSelectedShopValue() {
    var select = byId('select-shop');
    if (select && select.value) return select.value;
    try {
      if (typeof selectedShop !== 'undefined') return selectedShop;
    } catch (e) {}
    return 'all';
  }

  function normalizeDate(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  function startOfDay(date) {
    var next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function addDays(date, days) {
    var next = new Date(date);
    next.setDate(next.getDate() + days);
    return startOfDay(next);
  }

  function getPeriodRange(period, offset) {
    var today = startOfDay(new Date());
    var year = today.getFullYear();
    var shift = Number(offset || 0);
    var days;
    var end;

    if (period === 'today') {
      return { start: addDays(today, shift), end: addDays(today, shift), comparisonLabel: shift ? 'dia anterior' : 'ontem' };
    }

    if (period === 'yesterday') {
      return { start: addDays(today, -1 + shift), end: addDays(today, -1 + shift), comparisonLabel: 'dia anterior' };
    }

    if (period === 'before_yesterday') {
      return { start: addDays(today, -2 + shift), end: addDays(today, -2 + shift), comparisonLabel: 'dia anterior' };
    }

    if (period === 'year') {
      return {
        start: new Date(year + shift, 0, 1),
        end: shift === 0 ? today : new Date(year + shift, 11, 31),
        comparisonLabel: 'ano anterior'
      };
    }

    if (period === 'prev_year') {
      return {
        start: new Date(year - 1 + shift, 0, 1),
        end: new Date(year - 1 + shift, 11, 31),
        comparisonLabel: 'ano anterior ao selecionado'
      };
    }

    if (period === 'all') {
      return { start: null, end: null, comparisonLabel: 'período anterior' };
    }

    days = parseInt(period, 10);
    if (isNaN(days)) days = 30;
    end = addDays(today, shift * days);
    return {
      start: addDays(end, -(days - 1)),
      end: end,
      comparisonLabel: days === 30 ? 'mês anterior' : days + ' dias anteriores'
    };
  }

  function isDateInsideRange(dateValue, range) {
    var dateStr = normalizeDate(dateValue);
    if (!dateStr) return false;
    if (!range.start || !range.end) return true;
    var refDate = new Date(dateStr + 'T00:00:00');
    return refDate >= range.start && refDate <= range.end;
  }

  function matchesSelectedShop(row) {
    var selected = getSelectedShopValue();
    if (!selected || selected === 'all') return true;
    return String(row.shop_id || '') === String(selected);
  }

  function installPeriodOptions() {
    var select = byId('select-period');
    if (!select || select.dataset.jvOptionsApplied === 'true') return;

    var current = select.value || '30';
    select.innerHTML = PERIOD_OPTIONS.map(function (option) {
      return '<option value="' + option.value + '">' + option.label + '</option>';
    }).join('');
    select.value = PERIOD_OPTIONS.some(function (option) { return option.value === current; }) ? current : '30';
    setSelectedPeriodValue(select.value);
    select.dataset.jvOptionsApplied = 'true';
  }

  async function fetchCommerceDashboardSources() {
    var client = getClient();
    if (!client) return;

    try {
      var salesResult = await client
        .from('vw_sales_daily')
        .select('sales_date,gross_revenue,shop_id')
        .order('sales_date', { ascending: true })
        .limit(5000);

      if (!salesResult.error) commerceSalesDaily = salesResult.data || [];
    } catch (error) {
      console.warn('JV hotfix: erro ao buscar vw_sales_daily', error);
    }

    try {
      var adsResult = await client
        .from('shopee_ads_daily_performance')
        .select('performance_date,expense,direct_gmv,shop_id')
        .order('performance_date', { ascending: true })
        .limit(5000);

      if (!adsResult.error) commerceAdsDaily = adsResult.data || [];
    } catch (error) {
      console.warn('JV hotfix: erro ao buscar shopee_ads_daily_performance', error);
    }
  }

  function sumRows(rows, dateKey, amountKey, range) {
    var filtered = rows.filter(function (row) {
      return matchesSelectedShop(row) && isDateInsideRange(row[dateKey], range);
    });
    return {
      rows: filtered.length,
      total: filtered.reduce(function (sum, row) { return sum + Number(row[amountKey] || 0); }, 0)
    };
  }

  function sumAdsRows(range) {
    var filtered = commerceAdsDaily.filter(function (row) {
      return matchesSelectedShop(row) && isDateInsideRange(row.performance_date, range);
    });
    return {
      rows: filtered.length,
      expense: filtered.reduce(function (sum, row) { return sum + Number(row.expense || 0); }, 0),
      directGmv: filtered.reduce(function (sum, row) { return sum + Number(row.direct_gmv || 0); }, 0)
    };
  }

  function trendHtml(current, previous, comparisonLabel) {
    if (!previous || previous <= 0) return '<span>' + dash() + '</span> sem base no ' + comparisonLabel;
    var pct = ((current - previous) / previous) * 100;
    var up = pct >= 0;
    var icon = up ? 'arrow-up-right' : 'arrow-down-right';
    var colorClass = up ? 'trend-up' : 'trend-down';
    var sign = up ? '+' : '';
    return '<span class="' + colorClass + '"><i data-lucide="' + icon + '"></i> ' + sign + pct.toFixed(1) + '%</span> vs ' + comparisonLabel;
  }

  function setSubTextForCard(cardId, html) {
    var card = byId(cardId);
    var sub = card ? card.parentElement.querySelector('.metric-sub') : null;
    if (sub) sub.innerHTML = html;
  }

  function getCommerceMetrics() {
    var period = getSelectedPeriodValue();
    var currentRange = getPeriodRange(period, 0);
    var previousRange = period === 'all' ? null : getPeriodRange(period, -1);
    var currentSales = sumRows(commerceSalesDaily, 'sales_date', 'gross_revenue', currentRange);
    var previousSales = previousRange ? sumRows(commerceSalesDaily, 'sales_date', 'gross_revenue', previousRange) : { rows: 0, total: 0 };
    var currentAds = sumAdsRows(currentRange);
    var previousAds = previousRange ? sumAdsRows(previousRange) : { rows: 0, expense: 0, directGmv: 0 };

    return {
      period: period,
      comparisonLabel: currentRange.comparisonLabel,
      revenue: currentSales.total,
      revenueRows: currentSales.rows,
      previousRevenue: previousSales.total,
      adsExpense: currentAds.expense,
      adsRows: currentAds.rows,
      previousAdsExpense: previousAds.expense,
      adsGmv: currentAds.directGmv,
      roas: currentAds.expense > 0 ? (currentAds.directGmv / currentAds.expense).toFixed(2) : null
    };
  }

  function applyAbsenceDefaults() {
    var pairs = [
      ['card-faturamento', dash()],
      ['card-lucro', dash()],
      ['card-ads', dash()],
      ['card-estoque-alert', dash()],
      ['card-wallet', dash()],
      ['card-catalog', dash()]
    ];

    pairs.forEach(function (pair) {
      var el = byId(pair[0]);
      if (el && (/^R\$\s*0,00$/.test(el.innerText.trim()) || el.innerText.trim() === '0')) el.innerText = pair[1];
    });
  }

  function applyCommerceDashboardMetrics() {
    installPeriodOptions();
    if (!commerceSalesDaily.length && !commerceAdsDaily.length) {
      applyAbsenceDefaults();
      return;
    }

    var metrics = getCommerceMetrics();
    var revenueCard = byId('card-faturamento');
    var adsCard = byId('card-ads');
    var roasSub = byId('sub-roas');

    if (revenueCard) revenueCard.innerText = metrics.revenueRows ? formatBRL(metrics.revenue) : dash();
    setSubTextForCard('card-faturamento', metrics.revenueRows ? trendHtml(metrics.revenue, metrics.previousRevenue, metrics.comparisonLabel) : dash() + ' sem vendas no período');

    if (adsCard) adsCard.innerText = metrics.adsRows ? formatBRL(metrics.adsExpense) : dash();
    if (roasSub) {
      roasSub.innerHTML = metrics.adsRows && metrics.roas
        ? '<span class="trend-up"><i data-lucide="percent"></i> ROAS: ' + metrics.roas + '</span> no período · ' + trendHtml(metrics.adsExpense, metrics.previousAdsExpense, metrics.comparisonLabel)
        : dash() + ' sem dados de Ads no período';
    }

    setSubTextForCard('card-lucro', dash() + ' aguardando CMV/custos do período');

    var wallet = byId('card-wallet');
    var walletSub = byId('sub-wallet');
    if (wallet && /^R\$\s*0,00$/.test(wallet.innerText.trim())) wallet.innerText = dash();
    if (walletSub && wallet && wallet.innerText.trim() === dash()) walletSub.innerText = 'Sem saldo atualizado';

    var catalog = byId('card-catalog');
    var catalogSub = byId('sub-catalog');
    if (catalog && catalog.innerText.trim() === '0') catalog.innerText = dash();
    if (catalogSub && catalog && catalog.innerText.trim() === dash()) catalogSub.innerText = 'Sem dados de catálogo';

    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  function installCommerceDashboardPatch() {
    if (commercePatchInstalled) return;

    installPeriodOptions();

    if (typeof window.loadAllData === 'function') {
      var originalLoadAllData = window.loadAllData;
      window.loadAllData = async function () {
        var result = await originalLoadAllData.apply(this, arguments);
        installPeriodOptions();
        await fetchCommerceDashboardSources();
        applyCommerceDashboardMetrics();
        return result;
      };
    }

    if (typeof window.filterDataByPeriod === 'function') {
      var originalFilterDataByPeriod = window.filterDataByPeriod;
      window.filterDataByPeriod = function (period) {
        setSelectedPeriodValue(period);
        var result = originalFilterDataByPeriod.apply(this, arguments);
        setTimeout(applyCommerceDashboardMetrics, 0);
        return result;
      };
    }

    if (typeof window.filterDataByShop === 'function') {
      var originalFilterDataByShop = window.filterDataByShop;
      window.filterDataByShop = function () {
        var result = originalFilterDataByShop.apply(this, arguments);
        setTimeout(applyCommerceDashboardMetrics, 0);
        return result;
      };
    }

    commercePatchInstalled = true;
  }

  patchSupabaseFinancialHistoryLimit();
  installCommerceDashboardPatch();

  if (!window.lucide) window.lucide = { createIcons: function () {} };
  if (typeof window.setupDragAndDrop !== 'function') window.setupDragAndDrop = function () {};

  function bootDashboardPatch() {
    installPeriodOptions();
    installCommerceDashboardPatch();
    setTimeout(function () {
      fetchCommerceDashboardSources().then(applyCommerceDashboardMetrics).catch(function (error) {
        console.warn('JV hotfix: falha ao atualizar métricas comerciais', error);
      });
    }, 500);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootDashboardPatch, { once: true });
  } else {
    bootDashboardPatch();
  }
})();
