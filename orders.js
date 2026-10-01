(function () {
  'use strict';
  const PAGE_SIZE = 25;
  const ITEM_LIMIT = 200;
  const TIMEOUT_MS = 15000;
  const STATUS = {
    UNPAID: ['Aguardando pagamento', 'warning'],
    READY_TO_SHIP: ['A enviar', 'warning'],
    PROCESSED: ['Preparando envio', 'info'],
    SHIPPED: ['Enviado', 'info'],
    TO_CONFIRM_RECEIVE: ['Aguardando recebimento', 'info'],
    COMPLETED: ['Concluído', 'success'],
    IN_CANCEL: ['Cancelamento solicitado', 'warning'],
    CANCELLED: ['Cancelado', 'muted'],
    INVOICE_PENDING: ['Nota fiscal pendente', 'warning'],
    TO_RETURN: ['Devolução', 'warning']
  };
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const dates = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateText = (value) => value && Number.isFinite(new Date(value).getTime()) ? dates.format(new Date(value)) : 'Não informado';
  const amountText = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? money.format(Number(value)) : 'Não informado';
  const centsText = (value) => money.format(value / 100);
  const estimate = (order, items = order.shopee_order_items, complete = Array.isArray(items) && items.length <= ITEM_LIMIT) => window.mavisOrderCommission.estimate(order, items, complete);
  const receiptCell = (result) => result.kind === 'estimated' ? `<strong>${centsText(result.receiptCents)}</strong>` : `<span class="orders-estimate-unavailable">—<small>${escape(result.reason)}</small></span>`;
  function productsCell(order) {
    const items = (Array.isArray(order.shopee_order_items) ? order.shopee_order_items : []).filter(item => String(item.shop_id) === String(order.shop_id));
    if (!items.length) return '<span class="orders-product-unavailable">Itens não disponíveis</span>';
    const products = items.slice(0, 3).map(item => `<div class="orders-product"><span>${escape(item.item_name || 'Produto não informado')}</span><small>${item.model_name ? `${escape(item.model_name)} · ` : ''}Qtd: ${escape(item.quantity ?? '—')}</small></div>`).join('');
    const more = items.length > ITEM_LIMIT ? 'Mais itens em “Ver pedido”' : `+ ${items.length - 3} ${items.length - 3 === 1 ? 'item' : 'itens'} em “Ver pedido”`;
    return products + (items.length > 3 ? `<small class="orders-product-more">${more}</small>` : '');
  }
  const badge = (status) => `<span class="orders-badge ${STATUS[status]?.[1] || 'muted'}">${escape(STATUS[status]?.[0] || status || 'Não informado')}</span>`;
  let initialized = false;
  let visible = false;
  let page = 0;
  let rows = [];
  let shops = null;
  let connectionNames = new Map();
  let requestId = 0;
  let controller = null;
  let detailId = 0;
  let detailController = null;
  let filters = { search: '', status: '', from: '', to: '' };
  const el = (id) => document.getElementById(id);
  const shopName = (shopId) => {
    const connection = window.mavisIntegrations?.state?.oauth?.connections?.find((item) => String(item.external_shop_id) === String(shopId));
    return connectionNames.get(String(shopId)) || connection?.display_name || connection?.shop_name || shops?.get(String(shopId)) || String(shopId);
  };

  // The deadline also covers auth refresh, which can otherwise wait indefinitely.
  async function bounded(work, signalController) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(work),
        new Promise((_, reject) => { timer = setTimeout(() => {
          signalController.abort();
          reject(new Error('A consulta demorou mais que o esperado. Tente novamente.'));
        }, TIMEOUT_MS); })
      ]);
    } finally { clearTimeout(timer); }
  }

  function install() {
    if (initialized) return;
    const root = el('pedidos-view');
    if (!root) return;
    root.innerHTML = `
      <section class="orders-panel" aria-label="Consulta de pedidos">
        <div class="orders-heading"><div><h2>Pedidos das suas lojas</h2><p>Histórico importado da Shopee. Use o seletor de loja no topo para escolher um canal.</p></div><button type="button" id="orders-refresh" class="orders-button">Atualizar lista</button></div>
        <form id="orders-filters" class="orders-filters">
          <label class="orders-search">Número do pedido<input id="orders-search" type="search" maxlength="80" placeholder="Buscar pelo número" autocomplete="off"></label>
          <label>Status<select id="orders-status"><option value="">Todos os status</option>${Object.entries(STATUS).map(([value, [label]]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
          <label>Criado de<input id="orders-from" type="date"></label>
          <label>Até<input id="orders-to" type="date"></label>
          <div class="orders-filter-actions"><button type="submit" class="orders-button primary">Filtrar</button><button type="button" id="orders-clear" class="orders-button">Limpar</button></div>
        </form>
        <div id="orders-freshness" class="orders-freshness"></div>
        <div id="orders-message" class="orders-message" role="status" aria-live="polite"></div>
        <div id="orders-results" hidden>
          <div class="orders-summary"><span id="orders-summary-count"></span><span id="orders-summary-amount"></span><span id="orders-summary-receipt"></span><span id="orders-period-label">Todo o histórico · Horário de Brasília</span></div>
          <div class="orders-table-scroll" tabindex="0" role="region" aria-label="Tabela de pedidos"><table class="orders-table"><thead><tr><th scope="col">Pedido</th><th scope="col">Loja</th><th scope="col">Produtos</th><th scope="col">Criado em</th><th scope="col">Status</th><th scope="col">Comprador</th><th scope="col" class="orders-money">Valor do pedido</th><th scope="col" class="orders-money">Recebimento estimado</th><th scope="col">Detalhes</th></tr></thead><tbody id="orders-rows"></tbody></table></div>
          <p class="orders-estimate-note">Estimativa pela tabela de comissão informada, calculada por unidade sobre o valor dos itens. Frete e outros ajustes do repasse não entram no cálculo. Confira a composição em “Ver pedido”.</p>
        </div>
        <div class="orders-pagination"><span id="orders-page" aria-live="polite"></span><div><button type="button" id="orders-prev" class="orders-button" disabled>Anterior</button><button type="button" id="orders-next" class="orders-button" disabled>Próxima</button></div></div>
      </section>
      <dialog id="orders-detail" class="orders-dialog" aria-labelledby="orders-detail-title"><div class="orders-dialog-heading"><h2 id="orders-detail-title">Detalhes do pedido</h2><button type="button" id="orders-detail-close" class="orders-button" aria-label="Fechar detalhes">Fechar</button></div><div id="orders-detail-body" aria-live="polite"></div></dialog>`;
    el('orders-filters').addEventListener('submit', (event) => {
      event.preventDefault();
      const from = el('orders-from').value;
      const to = el('orders-to').value;
      el('orders-to').setCustomValidity(from && to && from > to ? 'A data final deve ser igual ou posterior à inicial.' : '');
      if (!el('orders-filters').reportValidity()) return;
      filters = { search: el('orders-search').value.trim(), status: el('orders-status').value, from, to };
      page = 0;
      load();
    });
    for (const id of ['orders-from', 'orders-to']) el(id).addEventListener('input', () => el('orders-to').setCustomValidity(''));
    el('orders-clear').addEventListener('click', () => {
      el('orders-filters').reset();
      el('orders-to').setCustomValidity('');
      filters = { search: '', status: '', from: '', to: '' };
      page = 0;
      load();
    });
    el('orders-refresh').addEventListener('click', refresh);
    el('orders-prev').addEventListener('click', () => { if (page > 0) { page--; load(); } });
    el('orders-next').addEventListener('click', () => { page++; load(); });
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-order-index]');
      if (button) showDetail(rows[Number(button.dataset.orderIndex)]);
      if (event.target.closest('[data-orders-retry]')) load();
      if (event.target.closest('[data-orders-integrations]')) window.switchView?.('shopee-sync');
    });
    el('orders-detail-close').addEventListener('click', closeDetail);
    el('orders-detail').addEventListener('close', cancelDetail);
    el('orders-detail').addEventListener('click', (event) => {
      if (event.target !== el('orders-detail')) return;
      const rect = event.target.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail();
    });
    initialized = true;
  }

  function cancelDetail() { detailId++; detailController?.abort(); if (initialized) el('orders-detail-body').textContent = ''; }
  function closeDetail() { if (initialized) { cancelDetail(); el('orders-detail').close(); } }
  function message(text, retry = false) {
    el('orders-message').innerHTML = `<p>${escape(text)}</p>${retry ? '<button type="button" class="orders-button" data-orders-retry>Tentar novamente</button>' : ''}`;
  }
  function selectedIds() {
    const selected = el('select-shop')?.value || 'all';
    const ids = [...shops.keys()];
    if (selected === 'all') return ids;
    if (!shops.has(String(selected))) throw new Error('Esta loja não está disponível para sua conta. Selecione outra loja.');
    return [String(selected)];
  }

  async function load() {
    install();
    if (!initialized || !visible) return;
    controller?.abort();
    controller = new AbortController();
    const current = controller;
    const id = ++requestId;
    closeDetail();
    rows = [];
    el('orders-rows').innerHTML = '';
    el('orders-results').hidden = true;
    el('orders-freshness').textContent = '';
    el('orders-prev').disabled = true;
    el('orders-next').disabled = true;
    el('orders-page').textContent = '';
    el('orders-results').setAttribute('aria-busy', 'true');
    message('Carregando pedidos…');
    try {
      const client = window.supabaseClient;
      if (!client) throw new Error('A conexão ainda não está pronta. Tente novamente.');
      const result = await bounded(async () => {
        const session = await client.auth.getSession();
        if (session.error || !session.data?.session) throw new Error('Entre na sua conta para consultar os pedidos.');
        if (!shops) {
          let scopeQuery = client.from('shopee_shops_safe').select('shop_id,shop_name,account_id').limit(500);
          const accountId = window.mavisIntegrations?.state?.account?.id;
          if (accountId) scopeQuery = scopeQuery.eq('account_id', accountId);
          const scope = await scopeQuery.abortSignal(current.signal);
          if (scope.error) throw new Error('Não foi possível carregar suas lojas. Tente novamente.');
          if (id !== requestId) return null;
          shops = new Map((scope.data || []).filter((shop) => shop.shop_id != null).map((shop) => [String(shop.shop_id), shop.shop_name || String(shop.shop_id)]));
        }
        const ids = selectedIds();
        if (!ids.length) return { data: [], noShops: true };
        let query = client.from('shopee_orders')
          .select('order_sn,shop_id,status,buyer_username,total_amount,created_at,synced_at,shopee_order_items(shop_id,item_name,model_name,quantity,unit_price)')
          .in('shop_id', ids)
          .limit(ITEM_LIMIT + 1, { referencedTable: 'shopee_order_items' })
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('order_sn', { ascending: false })
          .order('shop_id', { ascending: false });
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.search) query = query.ilike('order_sn', `%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
        // Brazil has no DST in the supported Shopee historical period.
        if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00-03:00`);
        if (filters.to) {
          const end = new Date(`${filters.to}T00:00:00-03:00`);
          end.setUTCDate(end.getUTCDate() + 1);
          query = query.lt('created_at', end.toISOString());
        }
        return await query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).abortSignal(current.signal);
      }, current);
      if (id !== requestId || !visible || !result) return;
      if (result.error) throw new Error('Não foi possível carregar os pedidos. Verifique sua conexão e tente novamente.');
      rows = (result.data || []).slice(0, PAGE_SIZE);
      el('orders-page').textContent = `Página ${page + 1} · Até ${PAGE_SIZE} pedidos por página`;
      el('orders-prev').disabled = page === 0;
      el('orders-next').disabled = (result.data || []).length <= PAGE_SIZE;
      if (!rows.length) {
        message(result.noShops ? 'Nenhuma loja disponível para sua conta. Confira as Integrações.' : 'Nenhum pedido encontrado para esta loja e estes filtros.');
        return;
      }
      message('');
      el('orders-results').hidden = false;
      el('orders-rows').innerHTML = rows.map((order, index) => `<tr>
        <td class="orders-number">${escape(order.order_sn)}</td><td>${escape(shopName(order.shop_id))}</td><td class="orders-products">${productsCell(order)}</td>
        <td class="orders-date">${dateText(order.created_at)}</td><td>${badge(order.status)}</td><td>${escape(order.buyer_username || 'Não informado')}</td>
        <td class="orders-money">${amountText(order.total_amount)}</td><td class="orders-money orders-receipt">${receiptCell(estimate(order))}</td><td><button type="button" class="orders-button small" data-order-index="${index}" aria-label="Ver pedido ${escape(order.order_sn)}">Ver pedido</button></td></tr>`).join('');
      el('orders-summary-count').textContent = `${rows.length} pedidos nesta página`;
      const values = rows.filter((order) => order.total_amount != null && Number.isFinite(Number(order.total_amount)));
      el('orders-summary-amount').textContent = `Valor desta página: ${money.format(values.reduce((total, order) => total + Number(order.total_amount), 0))}${values.length !== rows.length ? ' (valores disponíveis)' : ''}`;
      const receipts = rows.map(order => estimate(order)).filter(value => value.kind === 'estimated');
      el('orders-summary-receipt').textContent = receipts.length ? `Recebimento estimado nesta página: ${centsText(receipts.reduce((total, value) => total + value.receiptCents, 0))} · ${receipts.length} de ${rows.length} pedidos` : 'Recebimento estimado: não disponível para estes pedidos';
      el('orders-period-label').textContent = `${filters.from || filters.to ? 'Período filtrado' : 'Todo o histórico'} · Horário de Brasília`;
      const latest = Math.max(...rows.map((order) => new Date(order.synced_at || '').getTime()).filter(Number.isFinite));
      const stale = !Number.isFinite(latest) || Date.now() - latest > 86400000;
      el('orders-freshness').innerHTML = `<span>Dados importados${Number.isFinite(latest) ? ` · Última importação dos pedidos exibidos: ${dateText(latest)}` : ' · Data de importação não informada'}.${stale ? ' Confira a sincronização para obter pedidos recentes.' : ''}</span><button type="button" class="orders-button small" data-orders-integrations>Ver integrações</button>`;
    } catch (error) {
      if (id === requestId && visible) { message(error.message || 'Não foi possível carregar os pedidos.', true); el('orders-prev').disabled = page === 0; }
    } finally {
      if (id === requestId) el('orders-results').setAttribute('aria-busy', 'false');
    }
  }

  async function showDetail(order) {
    if (!order) return;
    cancelDetail();
    const id = detailId;
    detailController = new AbortController();
    const current = detailController;
    const dialog = el('orders-detail');
    el('orders-detail-title').textContent = `Pedido ${order.order_sn}`;
    el('orders-detail-body').textContent = 'Carregando detalhes…';
    if (!dialog.open) dialog.showModal();
    try {
      const [header, items] = await bounded(() => Promise.all([
        window.supabaseClient.from('shopee_orders').select('order_sn,shop_id,status,total_amount,payment_method,shipping_address,items_summary,created_at,updated_at,synced_at')
          .eq('shop_id', order.shop_id).eq('order_sn', order.order_sn).maybeSingle().abortSignal(current.signal),
        window.supabaseClient.from('shopee_order_items').select('id,shop_id,item_name,model_name,quantity,unit_price')
          .eq('shop_id', order.shop_id).eq('order_sn', order.order_sn).order('id').limit(ITEM_LIMIT + 1).abortSignal(current.signal)
      ]), current);
      if (id !== detailId || !dialog.open) return;
      if (header.error || items.error || !header.data) throw new Error('Não foi possível carregar os detalhes deste pedido. Feche e tente novamente.');
      const info = header.data;
      const lines = items.data || [];
      const receipt = estimate(info, lines, lines.length <= ITEM_LIMIT);
      const receiptSummary = receipt.kind === 'estimated' ? `<dl class="orders-receipt-summary"><div><dt>Valor dos itens</dt><dd>${centsText(receipt.grossCents)}</dd></div><div><dt>Comissão estimada</dt><dd>${centsText(receipt.commissionCents)}</dd></div><div><dt>Recebimento estimado</dt><dd>${centsText(receipt.receiptCents)}</dd></div></dl>` : `<p class="orders-estimate-note">Recebimento estimado não disponível: ${escape(receipt.reason)}.</p>`;
      const itemMarkup = lines.slice(0, ITEM_LIMIT).map(item => {
        const cost = receipt.kind === 'estimated' ? window.mavisOrderCommission.calculateLine(item) : null;
        return `<tr><td>${escape(item.item_name || 'Produto sem nome')}<small>${escape(item.model_name || '')}</small></td><td>${escape(item.quantity ?? '—')}</td><td class="orders-money">${amountText(item.unit_price)}</td><td class="orders-money">${cost ? `${centsText(cost.commissionCents)}<small>${cost.rate}% + ${centsText(cost.fixedCents)} / unidade</small>` : '—'}</td><td class="orders-money">${cost ? centsText(cost.receiptCents) : '—'}</td></tr>`;
      }).join('');
      el('orders-detail-body').innerHTML = `
        <div class="orders-detail-overview"><span>${escape(shopName(order.shop_id))}</span>${badge(info.status)}<strong>${amountText(info.total_amount)}</strong></div>
        <dl class="orders-detail-meta"><div><dt>Criado em</dt><dd>${dateText(info.created_at)}</dd></div><div><dt>Atualizado na origem</dt><dd>${dateText(info.updated_at)}</dd></div><div><dt>Importado em</dt><dd>${dateText(info.synced_at)}</dd></div><div><dt>Pagamento</dt><dd>${escape(info.payment_method || 'Não informado')}</dd></div></dl>
        ${receiptSummary}<p class="orders-estimate-note">Recebimento estimado = valor dos itens − comissão por unidade. O repasse confirmado pode incluir outros ajustes da Shopee.</p>
        <h3>Itens do pedido</h3>${lines.length ? `<div class="orders-table-scroll"><table class="orders-table"><thead><tr><th scope="col">Produto / Variação</th><th scope="col">Quantidade</th><th scope="col" class="orders-money">Preço unitário</th><th scope="col" class="orders-money">Comissão da linha</th><th scope="col" class="orders-money">Recebimento da linha</th></tr></thead><tbody>${itemMarkup}</tbody></table></div>${lines.length > ITEM_LIMIT ? '<p>Exibindo os primeiros 200 itens deste pedido. A estimativa exige todos os itens.</p>' : ''}` : `<p>Itens detalhados não disponíveis na importação.${info.items_summary ? ` ${escape(info.items_summary)}` : ''}</p>`}
        <h3>Endereço de entrega</h3><p class="orders-address">${escape(info.shipping_address || 'Não informado na importação.')}</p>`;
    } catch (error) {
      if (id === detailId && dialog.open) el('orders-detail-body').textContent = error.message || 'Não foi possível carregar os detalhes.';
    }
  }

  function refresh() { shops = null; page = 0; return load(); }
  function open() { visible = true; return refresh(); }
  function leave() { visible = false; requestId++; controller?.abort(); closeDetail(); rows = []; if (initialized) { el('orders-rows').innerHTML = ''; el('orders-results').hidden = true; } }
  function resetAccount() { leave(); shops = null; connectionNames = new Map(); page = 0; filters = { search: '', status: '', from: '', to: '' }; if (initialized) { el('orders-filters').reset(); el('orders-to').setCustomValidity(''); } }
  window.mavisOrders = Object.freeze({ open, refresh, leave });
  window.addEventListener('mavis:auth-expired', resetAccount);
  window.addEventListener('mavis:auth-changed', resetAccount);
  window.addEventListener('mavis:shop-connections-updated', (event) => {
    connectionNames = new Map((event.detail?.connections || []).map((connection) => [String(connection.shop_id), connection.shop_name]));
    shops = null;
    if (visible) refresh();
  });
})();
