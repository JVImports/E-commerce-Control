(function () {
  'use strict';

  var STORAGE_KEY = 'jv_theme';
  var ADS_ANALYZER_VERSION = '20260701-ads';
  var ADS_ANALYZER_PRODUCT_VERSION = '20260701-product-ads-v2';
  var LAYOUT_FIX_VERSION = '20260701-layout-fixes';

  function getStoredTheme() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    return stored === 'light' ? 'light' : 'dark';
  }

  function getActiveTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function updateThemeButton(theme) {
    var button = document.getElementById('theme-toggle');
    if (!button) return;

    var nextLabel = theme === 'light' ? 'Escuro' : 'Claro';
    var icon = theme === 'light' ? 'moon' : 'sun';
    button.setAttribute('aria-label', 'Alternar para modo ' + nextLabel.toLowerCase());
    button.setAttribute('title', 'Alternar para modo ' + nextLabel.toLowerCase());
    button.innerHTML = '<i data-lucide="' + icon + '"></i><span>' + nextLabel + '</span>';

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function applyTheme(theme, options) {
    var selected = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', selected);
    if (document.body) document.body.setAttribute('data-theme', selected);
    updateThemeButton(selected);

    if (!options || !options.silent) {
      setTimeout(function () {
        try {
          if (typeof window.renderDashboardCharts === 'function') window.renderDashboardCharts();
        } catch (e) {}
      }, 0);
    }
  }

  function normalizeApexOptions(options) {
    var light = getActiveTheme() === 'light';
    options = options || {};
    options.theme = Object.assign({}, options.theme || {}, { mode: light ? 'light' : 'dark' });
    options.grid = Object.assign({}, options.grid || {}, { borderColor: light ? '#dbe2ea' : '#1e293b' });
    options.tooltip = Object.assign({}, options.tooltip || {}, { theme: light ? 'light' : 'dark' });
    return options;
  }

  function patchApexCharts() {
    if (!window.ApexCharts || window.ApexCharts.__jvThemePatch) return;

    var OriginalApexCharts = window.ApexCharts;
    var PatchedApexCharts = function (element, options) {
      return new OriginalApexCharts(element, normalizeApexOptions(options));
    };

    PatchedApexCharts.prototype = OriginalApexCharts.prototype;
    Object.keys(OriginalApexCharts).forEach(function (key) {
      try { PatchedApexCharts[key] = OriginalApexCharts[key]; } catch (e) {}
    });

    ['exec', 'getChartByID'].forEach(function (key) {
      if (!OriginalApexCharts[key]) return;
      try { PatchedApexCharts[key] = OriginalApexCharts[key].bind(OriginalApexCharts); }
      catch (e) { PatchedApexCharts[key] = OriginalApexCharts[key]; }
    });

    PatchedApexCharts.__jvThemePatch = true;
    PatchedApexCharts.__jvOriginal = OriginalApexCharts;
    window.ApexCharts = PatchedApexCharts;
  }

  function ensureStylesheet(id, href) {
    if (document.getElementById(id)) return;
    var link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureScript(id, src, onload) {
    var existing = document.getElementById(id);
    if (existing) {
      if (typeof onload === 'function') onload();
      return;
    }
    var script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.defer = true;
    if (typeof onload === 'function') script.onload = onload;
    document.body.appendChild(script);
  }

  function refreshAdsAnalyzer() {
    if (window.jvAdsAnalyzer && typeof window.jvAdsAnalyzer.refresh === 'function') {
      window.jvAdsAnalyzer.refresh({ silent: true });
    }
    if (typeof window.renderDashboardCharts === 'function') {
      setTimeout(function () { window.renderDashboardCharts(); }, 0);
    }
  }

  function ensureProductAdsAssets() {
    ensureStylesheet('ads-analyzer-product-ads-css', 'ads-analyzer-product-ads.css?v=' + ADS_ANALYZER_PRODUCT_VERSION);
    ensureScript('ads-analyzer-product-ads-script', 'ads-analyzer-product-ads.js?v=' + ADS_ANALYZER_PRODUCT_VERSION, function () {
      refreshAdsAnalyzer();
    });
  }

  function ensureAdsAnalyzerAssets() {
    ensureStylesheet('layout-fixes-css', 'layout-fixes.css?v=' + LAYOUT_FIX_VERSION);
    ensureStylesheet('ads-analyzer-css', 'ads-analyzer.css?v=' + ADS_ANALYZER_VERSION);

    ensureScript('ads-analyzer-script', 'ads-analyzer.js?v=' + ADS_ANALYZER_VERSION, function () {
      refreshAdsAnalyzer();
      ensureProductAdsAssets();
    });

    if (document.getElementById('ads-analyzer-script')) {
      refreshAdsAnalyzer();
      ensureProductAdsAssets();
    }
  }

  function installThemeToggle() {
    var header = document.querySelector('header.top-header');
    if (!header) return;

    var existing = document.getElementById('theme-toggle');
    if (existing) {
      updateThemeButton(getActiveTheme());
      return;
    }

    var button = document.createElement('button');
    button.id = 'theme-toggle';
    button.type = 'button';
    button.className = 'theme-toggle-btn';
    button.onclick = window.toggleTheme;

    var profile = header.querySelector('.profile-section');
    header.insertBefore(button, profile || null);
    updateThemeButton(getActiveTheme());
  }

  window.toggleTheme = function () {
    var next = getActiveTheme() === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    applyTheme(next);
  };

  patchApexCharts();
  applyTheme(getStoredTheme(), { silent: true });

  window.addEventListener('DOMContentLoaded', function () {
    patchApexCharts();
    installThemeToggle();
    ensureAdsAnalyzerAssets();
    applyTheme(getStoredTheme(), { silent: true });
  });
})();