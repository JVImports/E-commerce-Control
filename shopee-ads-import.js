(function () {
  'use strict';

  var VERSION = '20260710-ads-manual-v1';
  var FUNCTION_SLUG = 'shopee-ads-import-v1';
  var state = { connections: [], rows: [], fileName: '', summary: null };

  var aliases = {
    performance_date: ['data','date','dia','performance date','performance_date'],
    campaign_id: ['id da campanha','campaign id','campaign_id','id campanha'],
    campaign_name: ['nome da campanha','campaign name','campaign_name','campanha'],
    item_id: ['id do produto','item id','item_id','id item','product id'],
    model_id: ['id da variacao','model id','model_id','variation id'],
    placement_key: ['posicionamento','placement','placement key','local de exibicao'],
    impressions: ['impressoes','impressions','visualizacoes do anuncio'],
    clicks: ['cliques','clicks'],
    orders: ['pedidos','orders','compras'],
    expense: ['despesa','gasto','investimento','expense','cost'],
    direct_gmv: ['gmv direto','vendas diretas','direct gmv','direct_gmv','receita direta'],
    broad_gmv: ['gmv amplo','vendas amplas','broad gmv','broad_gmv','receita ampla']
  };

  function byId(id) { return document.getElementById(id); }

  function normalizeKey(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function normalizedObject(row) {
    var result = {};
    Object.keys(row || {}).forEach(function (key) { result[normalizeKey(key)] = row[key]; });
    return result;
  }

  function pick(row, field) {
    var options = aliases[field] || [];
    for (var i = 0; i < options.length; i += 1) {
      var key = normalizeKey(options[i]);
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return '';
  }

  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    var text = String(value || '').replace(/R\$/gi, '').replace(/\s/g, '');
    if (!text) return 0;
    var comma = text.lastIndexOf(',');
    var dot = text.lastIndexOf('.');
    if (comma > dot) text = text.replace(/\./g, '').replace(',', '.');
    else if (dot > comma && comma >= 0) text = text.replace(/,/g, '');
    else if (comma >= 0) text = text.replace(',', '.');
    text = text.replace(/[^0-9.-]/g, '');
    var numberValue = Number(text);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  function parseDate(value) {
    if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && window.XLSX && XLSX.SSF) {
      var parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) return [parsed.y, String(parsed.m).padStart(2, '0'), String(parsed.d).padStart(2, '0')].join('-');
    }
    var text = String(value || '').trim();
    var iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return [iso[1], iso[2].padStart(2, '0'), iso[3].padStart(2, '0')].join('-');
    var br = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (br) return [br[3], br[2].padStart(2, '0'), br[1].padStart(2, '0')].join('-');
    return '';
  }

  function normalizeRows(rawRows) {
    var errors = [];
    var rows = rawRows.map(function (raw, index) {
      var row = normalizedObject(raw);
      var date = parseDate(pick(row, 'performance_date'));
      if (!date) errors.push('Linha ' + (index + 2) + ': data não reconhecida.');
      return {
        performance_date: date,
        campaign_id: String(pick(row, 'campaign_id') || ''),
        campaign_name: String(pick(row, 'campaign_name') || ''),
        item_id: String(pick(row, 'item_id') || '0').replace(/\.0$/, ''),
        model_id: String(pick(row, 'model_id') || '0').replace(/\.0$/, ''),
        placement_key: String(pick(row, 'placement_key') || ''),
        impressions: Math.max(0, Math.trunc(parseNumber(pick(row, 'impressions')))),
        clicks: Math.max(0, Math.trunc(parseNumber(pick(row, 'clicks')))),
        orders: Math.max(0, Math.trunc(parseNumber(pick(row, 'orders')))),
        expense: Math.max(0, parseNumber(pick(row, 'expense'))),
        direct_gmv: Math.max(0, parseNumber(pick(row, 'direct_gmv'))),
        broad_gmv: Math.max(0, parseNumber(pick(row, 'broad_gmv')))
      };
    }).filter(function (row) { return row.performance_date; });
    if (!rows.length) errors.push('Nenhuma linha diária válida foi encontrada.');
    return { rows: rows, errors: errors };
  }

  function selectedConnection() {
    var select = byId('jv-ads-import-shop');
    var id = select ? select.value : '';
    return state.connections.find(function (row) { return String(row.id) === String(id); }) || null;
  }

  function renderConnections() {
    var select = byId('jv-ads-import-shop');
    if (!select) return;
    var current = select.value;
    var connected = state.connections.filter(function (row) { return row.status === 'active'; });
    select.innerHTML = connected.map(function (row) {
      return '<option value="' + String(row.id).replace(/"/g, '&quot;') + '">' +
        String(row.shop_name || ('Shopee ' + row.external_shop_id)).replace(/</g, '&lt;') + '</option>';
    }).join('');
    if (connected.some(function (row) { return String(row.id) === String(current); })) select.value = current;
    var button = byId('jv-ads-import-submit');
    if (button) button.disabled = !state.rows.length || !connected.length;
  }

  function setStatus(message, type) {
    var el = byId('jv-ads-import-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'jv-ads-import-status ' + (type || 'info');
  }

  async function readFile(file) {
    if (!window.XLSX) throw new Error('Leitor XLSX não carregado.');
    if (file.size > 10 * 1024 * 1024) throw new Error('O arquivo excede 10 MB.');
    var workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    var sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('A planilha não possui abas.');
    var raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });
    if (raw.length > 5000) throw new Error('Este primeiro corte aceita até 5.000 linhas.');
    var normalized = normalizeRows(raw);
    state.rows = normalized.rows;
    state.fileName = file.name;
    var dates = state.rows.map(function (row) { return row.performance_date; }).sort();
    var expense = state.rows.reduce(function (sum, row) { return sum + Number(row.expense || 0); }, 0);
    state.summary = {
      rows: state.rows.length,
      start: dates[0] || '-',
      end: dates[dates.length - 1] || '-',
      expense: expense,
      errors: normalized.errors
    };
    var preview = byId('jv-ads-import-preview');
    if (preview) {
      preview.innerHTML = '<strong>' + state.summary.rows + ' linhas</strong>' +
        '<span>' + state.summary.start + ' a ' + state.summary.end + '</span>' +
        '<span>Gasto: ' + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(expense) + '</span>' +
        (normalized.errors.length ? '<em>' + normalized.errors.slice(0, 3).join(' ') + '</em>' : '');
    }
    renderConnections();
    setStatus(normalized.errors.length ? 'Revise os avisos antes de importar.' : 'Arquivo validado para prévia.', normalized.errors.length ? 'warning' : 'ok');
  }

  async function callImport(payload) {
    var client = window.supabaseClient;
    if (!client || !client.auth) throw new Error('Supabase não conectado.');
    var session = (await client.auth.getSession()).data.session;
    if (!session) throw new Error('Entre novamente para importar.');
    var base = String((typeof supabaseUrl !== 'undefined' && supabaseUrl) || localStorage.getItem('supabase_url') || '').replace(/\/+$/, '');
    var response = await fetch(base + '/functions/v1/' + FUNCTION_SLUG, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify(payload)
    });
    var text = await response.text();
    var data = text ? JSON.parse(text) : {};
    if (!response.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + response.status));
    return data;
  }

  async function submit() {
    var connection = selectedConnection();
    var complete = byId('jv-ads-import-complete');
    if (!connection) return setStatus('Selecione uma loja conectada.', 'error');
    if (!complete || !complete.checked) return setStatus('Confirme que o relatório cobre integralmente o período.', 'error');
    var button = byId('jv-ads-import-submit');
    button.disabled = true;
    setStatus('Importando e substituindo o período informado...', 'info');
    try {
      var data = await callImport({
        account_id: connection.account_id,
        connection_id: connection.id,
        file_name: state.fileName,
        replace_period: true,
        rows: state.rows
      });
      setStatus(data.duplicate ? 'Este mesmo relatório já havia sido importado.' : 'Importação concluída: ' + data.rows + ' linhas.', 'ok');
      window.dispatchEvent(new CustomEvent('jv:ads-imported', { detail: data }));
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  function install() {
    var host = document.querySelector('#anuncios-view .panel-card');
    if (!host || byId('jv-ads-import-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'jv-ads-import-panel';
    panel.className = 'jv-ads-import-panel';
    panel.innerHTML = [
      '<div class="jv-ads-import-head"><div><h4>Importar relatório Shopee Ads</h4>',
      '<p>Fonte manual por loja. O período importado substitui o período anterior para evitar dupla contagem.</p></div>',
      '<span>CSV/XLSX · até 10 MB</span></div>',
      '<div class="jv-ads-import-grid"><label><span>Loja conectada</span><select id="jv-ads-import-shop"></select></label>',
      '<label class="jv-ads-import-file"><span>Relatório exportado</span><input id="jv-ads-import-file" type="file" accept=".csv,.xlsx,.xls"></label></div>',
      '<div id="jv-ads-import-preview" class="jv-ads-import-preview">Selecione um relatório diário por produto.</div>',
      '<label class="jv-ads-import-confirm"><input id="jv-ads-import-complete" type="checkbox"> Confirmo que o arquivo representa o período completo desta loja.</label>',
      '<div class="jv-ads-import-actions"><button id="jv-ads-import-submit" class="btn-primary" type="button" disabled>Importar Ads</button>',
      '<span id="jv-ads-import-status" class="jv-ads-import-status info"></span></div>'
    ].join('');
    host.insertBefore(panel, host.firstChild);

    byId('jv-ads-import-file').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      if (file) readFile(file).catch(function (error) { setStatus(error.message, 'error'); });
    });
    byId('jv-ads-import-submit').addEventListener('click', submit);
    window.addEventListener('mavis:shop-connections-updated', function (event) {
      state.connections = event.detail && event.detail.connections ? event.detail.connections : [];
      renderConnections();
    });
    if (window.jvShopeeThirdParty) {
      state.connections = (window.jvShopeeThirdParty.state.oauth || {}).connections || [];
      renderConnections();
    }
  }

  window.jvShopeeAdsImport = { version: VERSION, install: install, state: state };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
