(function () {
  'use strict';

  var STORAGE_KEY = 'jv_theme';
  var ADS_ANALYZER_VERSION = '20260701-ads';

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

  function ensureAdsAnalyzerAssets() {
    ensureStylesheet('ads-analyzer-css', 'ads-analyzer.css?v=' + ADS_ANALYZER_VERSION);

    if (document.getElementById('ads-analyzer-script')) {
      if (window.jvAdsAnalyzer && typeof window.jvAdsAnalyzer.refresh === 'function') {
        window.jvAdsAnalyzer.refresh({ silent: true });
      }
      return;
    }

    var script = document.createElement('script');
    script.id = 'ads-analyzer-script';
    script.src = 'ads-analyzer.js?v=' + ADS_ANALYZER_VERSION;
    script.defer = true;
    script.onload = function () {
      if (window.jvAdsAnalyzer && typeof window.jvAdsAnalyzer.refresh === 'function') {
        window.jvAdsAnalyzer.refresh({ silent: true });
      }
      if (typeof window.renderDashboardCharts === 'function') {
        setTimeout(function () { window.renderDashboardCharts(); }, 0);
      }
    };
    document.body.appendChild(script);
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