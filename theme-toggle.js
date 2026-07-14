(function () {
  'use strict';

  var STORAGE_KEY = 'jv_theme';
  var ADS_ANALYZER_VERSION = '20260710-release-hardening';
  var ADS_ANALYZER_PRODUCT_VERSION = '20260710-release-hardening';
  var LAYOUT_FIX_VERSION = '20260710-release-hardening';
  var SHOPEE_MULTI_APP_VERSION = '20260710-release-hardening';
  var AUTH_SYNC_V2_VERSION = '20260710-release-hardening';
  var SHOPEE_THIRD_PARTY_VERSION = '20260710-third-party-v3';
  var SHOPEE_ADS_IMPORT_VERSION = '20260710-ads-manual-v1';

  function guardShopeeOAuthCallback() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      if (params.get('code') && params.get('state')) {
        sessionStorage.setItem('jv_shopee_oauth_callback', window.location.search);
        window.history.replaceState({ jvShopeeOAuth: true }, document.title, window.location.pathname + window.location.hash);
      }
    } catch (e) {}
  }

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
      if (existing.dataset.loaded === 'true') {
        if (typeof onload === 'function') onload();
      } else if (typeof onload === 'function') {
        existing.addEventListener('load', onload, { once: true });
      }
      return existing;
    }

    var script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.defer = true;
    script.onload = function () {
      script.dataset.loaded = 'true';
      if (typeof onload === 'function') onload();
    };
    script.onerror = function () {
      window.dispatchEvent(new CustomEvent('jv:asset-error', { detail: { id: id, src: src } }));
    };
    document.body.appendChild(script);
    return script;
  }

  function refreshAdsAnalyzer() {
    if (window.jvAdsAnalyzer && typeof window.jvAdsAnalyzer.refresh === 'function') {
      window.jvAdsAnalyzer.refresh({ silent: true });
    }
    if (typeof window.renderDashboardCharts === 'function') {
      setTimeout(function () { window.renderDashboardCharts(); }, 0);
    }
  }

  function ensureAuthSyncV2Assets() {
    ensureScript('supabase-auth-sync-v2-script', 'supabase-auth-sync-v2.js?v=' + AUTH_SYNC_V2_VERSION, function () {
      if (window.jvAuthSyncV2 && typeof window.jvAuthSyncV2.hydrate === 'function') {
        window.jvAuthSyncV2.hydrate();
      }
    });
  }

  function ensureShopeeThirdPartyAssets() {
    ensureStylesheet('shopee-third-party-app-css', 'shopee-third-party-app.css?v=' + SHOPEE_THIRD_PARTY_VERSION);
    ensureScript('shopee-third-party-app-script', 'shopee-third-party-app.js?v=' + SHOPEE_THIRD_PARTY_VERSION, function () {
      if (window.jvShopeeThirdParty && typeof window.jvShopeeThirdParty.install === 'function') {
        window.jvShopeeThirdParty.install();
      }
    });
    ensureStylesheet('shopee-ads-import-css', 'shopee-ads-import.css?v=' + SHOPEE_ADS_IMPORT_VERSION);
    ensureScript('shopee-ads-import-script', 'shopee-ads-import.js?v=' + SHOPEE_ADS_IMPORT_VERSION, function () {
      if (window.jvShopeeAdsImport && typeof window.jvShopeeAdsImport.install === 'function') {
        window.jvShopeeAdsImport.install();
      }
    });
  }

  function ensureShopeeMultiAppAssets() {
    ensureStylesheet('shopee-multi-app-css', 'shopee-multi-app.css?v=' + SHOPEE_MULTI_APP_VERSION);
    ensureScript('shopee-multi-app-script', 'shopee-multi-app.js?v=' + SHOPEE_MULTI_APP_VERSION, function () {
      if (window.jvShopeeMultiApp && typeof window.jvShopeeMultiApp.install === 'function') {
        window.jvShopeeMultiApp.install();
      }
    });
    ensureScript('shopee-oauth-callback-script', 'shopee-oauth-callback.js?v=' + SHOPEE_MULTI_APP_VERSION);
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

    if (window.jvAdsAnalyzer) {
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

  guardShopeeOAuthCallback();
  patchApexCharts();
  applyTheme(getStoredTheme(), { silent: true });

  window.addEventListener('DOMContentLoaded', function () {
    patchApexCharts();
    installThemeToggle();
    ensureShopeeThirdPartyAssets();
    ensureAuthSyncV2Assets();
    ensureAdsAnalyzerAssets();
    applyTheme(getStoredTheme(), { silent: true });
  });
})();
