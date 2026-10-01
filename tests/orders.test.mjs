import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../orders.js', import.meta.url), 'utf8');
const commissionSource = await readFile(new URL('../order-commission.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const flush = async () => { for (let i = 0; i < 6; i++) await tick(); };
function harness({ respond, timeout = 15000, session = true } = {}) {
  const nodes = new Map();
  const events = new Map();
  const calls = [];
  class Element {
    constructor(id) { this.id = id; this.events = {}; this.value = ''; this.hidden = false; this.open = false; this.textContent = ''; this.html = ''; this.style = {}; this.attributes = {}; }
    set innerHTML(value) {
      this.html = value;
      for (const match of value.matchAll(/id="([^"]+)"/g)) if (!nodes.has(match[1])) nodes.set(match[1], new Element(match[1]));
    }
    get innerHTML() { return this.html; }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    fire(name, options = {}) { for (const fn of this.events[name] || []) fn({ preventDefault() {}, target: this, ...options }); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    getBoundingClientRect() { return { left: 40, top: 100, bottom: 136, width: 360, height: 220 }; }
    setCustomValidity(value) { this.validity = value; }
    reportValidity() { return !nodes.get('orders-to').validity; }
    reset() { for (const id of ['orders-search', 'orders-status', 'orders-from', 'orders-to']) nodes.get(id).value = ''; }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
  }
  nodes.set('pedidos-view', new Element('pedidos-view'));
  nodes.set('select-shop', new Element('select-shop'));
  nodes.get('select-shop').value = 'all';
  const window = {
    innerWidth: 1024, innerHeight: 768,
    addEventListener(name, fn) { events.set(name, fn); },
    supabaseClient: {
      auth: { getSession: async () => ({ data: { session: session ? {} : null } }) },
      from(table) {
        const call = { table, operations: [] };
        const query = { then(resolve, reject) {
          calls.push(call);
          const fallback = table === 'shopee_shops_safe' ? [{ shop_id: 1, shop_name: 'Loja A' }, { shop_id: 2, shop_name: 'Loja B' }] : [];
          return Promise.resolve(respond?.(call) ?? { data: fallback }).then(resolve, reject);
        } };
        for (const name of ['select', 'limit', 'eq', 'in', 'order', 'ilike', 'gte', 'lt', 'range', 'abortSignal', 'maybeSingle']) query[name] = (...args) => { call.operations.push([name, ...args]); return query; };
        return query;
      }
    }
  };
  vm.runInNewContext(commissionSource, { window });
  vm.runInNewContext(source, { window, document: { getElementById: id => nodes.get(id) }, URL, Intl, Date, Map, Promise, AbortController, setTimeout: (fn, ms) => setTimeout(fn, ms === 15000 ? timeout : ms), clearTimeout });
  const clickDetail = index => nodes.get('pedidos-view').fire('click', { target: { closest: selector => selector === '[data-order-index]' ? { dataset: { orderIndex: String(index) } } : null } });
  return { window, nodes, calls, events, clickDetail };
}
const order = (number, shop = 1) => ({ order_sn: number, shop_id: shop, status: 'COMPLETED', buyer_username: 'Comprador', total_amount: 10, created_at: '2026-08-11T15:00:00Z', synced_at: '2026-08-11T16:00:00Z' });
const op = (call, name) => call.operations.filter(entry => entry[0] === name);

test('product photos use one bounded catalogue read, preserve shop scope and disclose escaped item details on focus', async () => {
  const photo = 'https://cf.shopee.com.br/file/example';
  const unsafe = '<img src=x onerror=alert(1)>';
  const h = harness({ respond: call => {
    if (call.table === 'shopee_orders') return { data: [
      { ...order('MULTI'), shopee_order_items: [{ shop_id: 1, item_id: 10, item_name: unsafe, model_name: 'Azul <grande>', quantity: 2, unit_price: 20 }, { shop_id: 1, item_id: 11, item_name: 'Segundo produto', quantity: 3, unit_price: 10 }] },
      { ...order('PHOTO', 2), shopee_order_items: [{ shop_id: 2, item_id: 10, item_name: 'Com foto', quantity: 1, unit_price: 20 }] },
      { ...order('UNSAFE'), shopee_order_items: [{ shop_id: 1, item_id: 12, item_name: 'Sem foto', quantity: 1, unit_price: 20 }] }
    ] };
    if (call.table === 'shopee_products') return { data: [{ shop_id: 2, item_id: 10, image_url: photo }, { shop_id: 1, item_id: 12, image_url: 'https://cf.shopee.com.br.evil.example/image' }] };
  } });
  await h.window.mavisOrders.open();
  const reads = h.calls.filter(call => call.table === 'shopee_products');
  assert.equal(reads.length, 1);
  assert.deepEqual(op(reads[0], 'limit'), [['limit', 26]]);
  assert.deepEqual(Array.from(op(reads[0], 'in')[0][2]), ['1', '2']);
  assert.deepEqual(Array.from(op(reads[0], 'in')[1][2]), ['10', '12']);
  const html = h.nodes.get('orders-rows').innerHTML;
  assert.equal((html.match(/<img /g) || []).length, 1, 'a catalogue image cannot cross shops');
  assert.match(html, /orders-product-count">\+1/);
  assert.doesNotMatch(html, /evil\.example|onerror=alert\(1\)>/);
  const trigger = h.nodes.get('orders-refresh');
  trigger.dataset = { productsPreview: '0' };
  h.nodes.get('pedidos-view').fire('focusin', { target: { closest: () => trigger } });
  const preview = h.nodes.get('orders-products-preview');
  assert.equal(preview.hidden, false);
  assert.match(preview.innerHTML, /&lt;img/);
  assert.match(preview.innerHTML, /Azul &lt;grande&gt; · Qtd: 2/);
  assert.match(preview.innerHTML, /Segundo produto/);
  assert.match(preview.innerHTML, /Qtd: 3/);
  assert.equal(trigger.attributes['aria-describedby'], 'orders-products-preview');
  h.nodes.get('pedidos-view').fire('keydown', { key: 'Escape' });
  assert.equal(preview.hidden, true);
  assert.equal(trigger.attributes['aria-describedby'], undefined);
});

test('an unavailable catalogue does not hide the orders or their product labels', async () => {
  const h = harness({ respond: call => call.table === 'shopee_orders' ? { data: [{ ...order('NO-PHOTO'), shopee_order_items: [{ shop_id: 1, item_id: 10, item_name: 'Produto sem imagem', quantity: 1, unit_price: 20 }] }] } : call.table === 'shopee_products' ? { error: { message: 'unavailable' } } : undefined });
  await h.window.mavisOrders.open();
  assert.equal(h.nodes.get('orders-results').hidden, false);
  assert.match(h.nodes.get('orders-rows').innerHTML, /Produto sem imagem/);
  assert.doesNotMatch(h.nodes.get('orders-rows').innerHTML, /<img /);
});

test('orders load only on opening, use a bounded page, and fetch the next page without recounting', async () => {
  const h = harness({ respond: call => call.table === 'shopee_orders' ? { data: Array.from({ length: 26 }, (_, i) => order(`ORDER-${i}`)) } : undefined });
  assert.equal(h.calls.length, 0);
  await h.window.mavisOrders.open();
  const first = h.calls.find(c => c.table === 'shopee_orders');
  assert.deepEqual(op(first, 'range'), [['range', 0, 25]]);
  assert.deepEqual(Array.from(op(first, 'in')[0][2]), ['1', '2']);
  assert.equal(op(first, 'select')[0].length, 2, 'no expensive exact count');
  assert.equal((h.nodes.get('orders-rows').innerHTML.match(/<tr>/g) || []).length, 25);
  assert.equal(h.nodes.get('orders-next').disabled, false);
  h.nodes.get('orders-next').fire('click'); await flush();
  assert.deepEqual(op(h.calls.at(-1), 'range'), [['range', 25, 50]]);
  assert.equal(h.calls.filter(c => c.table === 'shopee_shops_safe').length, 1);
});

test('shop, literal search, status and inclusive Brazil date filters are applied on the server', async () => {
  const h = harness(); await h.window.mavisOrders.open();
  h.nodes.get('select-shop').value = '2';
  h.nodes.get('orders-search').value = 'ID%_';
  h.nodes.get('orders-status').value = 'SHIPPED';
  h.nodes.get('orders-from').value = '2026-08-01';
  h.nodes.get('orders-to').value = '2026-08-11';
  h.nodes.get('orders-filters').fire('submit'); await flush();
  const call = h.calls.at(-1);
  assert.deepEqual(Array.from(op(call, 'in')[0][2]), ['2']);
  assert.deepEqual(op(call, 'ilike'), [['ilike', 'order_sn', '%ID\\%\\_%']]);
  assert.deepEqual(op(call, 'eq'), [['eq', 'status', 'SHIPPED']]);
  assert.deepEqual(op(call, 'gte'), [['gte', 'created_at', '2026-08-01T00:00:00-03:00']]);
  assert.deepEqual(op(call, 'lt'), [['lt', 'created_at', '2026-08-12T03:00:00.000Z']]);
});

test('invalid dates and unavailable shops never issue an orders query', async () => {
  const h = harness(); await h.window.mavisOrders.open();
  const count = h.calls.length;
  h.nodes.get('orders-from').value = '2026-08-12'; h.nodes.get('orders-to').value = '2026-08-11';
  h.nodes.get('orders-filters').fire('submit'); await flush();
  assert.equal(h.calls.length, count);
  h.nodes.get('select-shop').value = '999'; await h.window.mavisOrders.refresh();
  assert.equal(h.calls.filter(c => c.table === 'shopee_orders').length, 1);
  assert.match(h.nodes.get('orders-message').innerHTML, /não está disponível/);
});

test('failures, missing sessions and deadlines do not look like empty results', async () => {
  for (const config of [
    { session: false },
    { respond: call => call.table === 'shopee_orders' ? { error: { message: 'private internal error' } } : undefined },
    { timeout: 5, respond: call => call.table === 'shopee_orders' ? new Promise(() => {}) : undefined }
  ]) {
    const h = harness(config); await h.window.mavisOrders.open();
    assert.match(h.nodes.get('orders-message').innerHTML, /Tentar novamente/);
    assert.doesNotMatch(h.nodes.get('orders-message').innerHTML, /Nenhum pedido|private internal error/);
    assert.equal(h.nodes.get('orders-results').hidden, true);
  }
  const empty = harness(); await empty.window.mavisOrders.open();
  assert.match(empty.nodes.get('orders-message').innerHTML, /Nenhum pedido/);
  assert.doesNotMatch(empty.nodes.get('orders-message').innerHTML, /Tentar novamente/);
});

test('late responses cannot overwrite the currently selected store or a closed screen', async () => {
  const pending = [];
  const h = harness({ respond: call => call.table === 'shopee_orders' ? new Promise(resolve => pending.push(resolve)) : undefined });
  const first = h.window.mavisOrders.open(); await flush();
  h.nodes.get('select-shop').value = '2';
  const second = h.window.mavisOrders.refresh(); await flush();
  pending[1]({ data: [order('CURRENT', 2)] }); await second;
  pending[0]({ data: [order('OLD')] }); await first;
  assert.match(h.nodes.get('orders-rows').innerHTML, /CURRENT/);
  assert.doesNotMatch(h.nodes.get('orders-rows').innerHTML, /OLD/);
  const third = h.window.mavisOrders.refresh(); await flush(); h.window.mavisOrders.leave();
  pending[2]({ data: [order('CLOSED')] }); await third;
  assert.equal(h.nodes.get('orders-results').hidden, true);
  assert.equal(h.nodes.get('orders-rows').innerHTML, '');
});

test('details are bound to both shop and order, bounded, and all imported text is escaped', async () => {
  const dangerous = '<img src=x onerror=alert(1)>';
  const h = harness({ respond: call => {
    if (call.table === 'shopee_orders') return op(call, 'maybeSingle').length ? { data: { ...order('SAME', 2), shipping_address: dangerous, payment_method: dangerous } } : { data: [{ ...order('SAME', 2), buyer_username: dangerous, shopee_order_items: [{ shop_id: 2, item_name: dangerous, model_name: dangerous, quantity: 2, unit_price: 5 }, { shop_id: 1, item_name: 'WRONG-SHOP-PRODUCT' }] }] };
    if (call.table === 'shopee_order_items') return { data: [{ item_name: dangerous, model_name: dangerous, quantity: 2, unit_price: 5 }] };
  } });
  await h.window.mavisOrders.open(); h.clickDetail(0); await flush();
  for (const call of h.calls.slice(-2)) assert.deepEqual(op(call, 'eq'), [['eq', 'shop_id', 2], ['eq', 'order_sn', 'SAME']]);
  assert.deepEqual(op(h.calls.at(-1), 'limit'), [['limit', 201]]);
  assert.match(h.nodes.get('orders-detail-body').innerHTML, /&lt;img/);
  assert.doesNotMatch(h.nodes.get('orders-detail-body').innerHTML, /<img/);
  assert.doesNotMatch(h.nodes.get('orders-rows').innerHTML, /<img/);
  assert.match(h.nodes.get('orders-rows').innerHTML, /class="orders-product-name">&lt;img/);
  assert.doesNotMatch(h.nodes.get('orders-rows').innerHTML, /WRONG-SHOP-PRODUCT/);
  assert.match(h.nodes.get('orders-freshness').innerHTML, /Confira a sincronização/);
  h.nodes.get('orders-detail-close').fire('click'); assert.equal(h.nodes.get('orders-detail').open, false);
});

test('sign out aborts pending reads and clears the orders list', async () => {
  const h = harness({ respond: call => call.table === 'shopee_orders' ? { data: [order('PRIVATE')] } : undefined });
  await h.window.mavisOrders.open(); h.events.get('mavis:auth-expired')();
  assert.equal(h.nodes.get('orders-rows').innerHTML, '');
  assert.equal(h.nodes.get('orders-results').hidden, true);
  assert.equal(op(h.calls.at(-1), 'abortSignal')[0][1].aborted, true);
});

test('current connection names replace legacy shop labels without changing the authorized scope', async () => {
  const h = harness({ respond: call => call.table === 'shopee_orders' ? { data: [order('CURRENT', 2)] } : undefined });
  await h.window.mavisOrders.open();
  h.events.get('mavis:shop-connections-updated')({ detail: { connections: [{ shop_id: 2, shop_name: 'Nome atualizado <Loja B>' }] } });
  await flush();
  assert.match(h.nodes.get('orders-rows').innerHTML, /Nome atualizado &lt;Loja B&gt;/);
  assert.deepEqual(Array.from(op(h.calls.at(-1), 'in')[0][2]), ['1', '2']);
});

test('receipt estimates use item prices and quantities in the same bounded request, excluding unavailable and cancelled orders from the page total', async () => {
  const h = harness({ respond: call => call.table === 'shopee_orders' ? { data: [
    { ...order('TWO-UNITS'), total_amount: 999, shopee_order_items: [{ shop_id: 1, quantity: 2, unit_price: 79.99 }] },
    { ...order('CANCELLED'), status: 'CANCELLED', shopee_order_items: [{ shop_id: 1, quantity: 1, unit_price: 80 }] },
    { ...order('MISSING'), shopee_order_items: [] }
  ] } : undefined });
  await h.window.mavisOrders.open();
  const query = h.calls.find(call => call.table === 'shopee_orders');
  assert.match(op(query, 'select')[0][1], /shopee_order_items\(shop_id,item_id,item_name,model_name,quantity,unit_price\)/);
  assert.deepEqual(JSON.parse(JSON.stringify(op(query, 'limit'))), [['limit', 201, { referencedTable: 'shopee_order_items' }]]);
  assert.equal(h.calls.length, 2, 'no additional per-order requests');
  assert.match(h.nodes.get('orders-rows').innerHTML.replace(/\s/g, ''), /R\$118,98/);
  assert.match(h.nodes.get('orders-rows').innerHTML, /Pedido cancelado|Itens não disponíveis/);
  assert.match(h.nodes.get('orders-summary-receipt').textContent.replace(/\s/g, ''), /R\$118,98/);
  assert.match(h.nodes.get('orders-summary-receipt').textContent, /1 de 3 pedidos/);
});

test('details explain the commission per unit and reconcile with the estimated receipt', async () => {
  const h = harness({ respond: call => {
    if (call.table === 'shopee_orders') return op(call, 'maybeSingle').length ? { data: order('DETAIL') } : { data: [{ ...order('DETAIL'), shopee_order_items: [{ shop_id: 1, quantity: 2, unit_price: 39.99 }] }] };
    if (call.table === 'shopee_order_items') return { data: [{ id: 1, shop_id: 1, item_name: 'Produto', quantity: 2, unit_price: 39.99 }] };
  } });
  await h.window.mavisOrders.open(); h.clickDetail(0); await flush();
  const detail = h.nodes.get('orders-detail-body').innerHTML.replace(/\s/g, '');
  assert.match(detail, /Valordositens<\/dt><dd>R\$79,98/);
  assert.match(detail, /Comissãoestimada<\/dt><dd>R\$25,00/);
  assert.match(detail, /Recebimentoestimado<\/dt><dd>R\$54,98/);
  assert.match(detail, /20%\+R\$4,50\/unidade/);
});

test('a truncated item list never displays a partial receipt as the full estimate', async () => {
  const lines = Array.from({ length: 201 }, () => ({ shop_id: 1, quantity: 1, unit_price: 80 }));
  const h = harness({ respond: call => call.table === 'shopee_orders' ? { data: [{ ...order('LONG'), shopee_order_items: lines }] } : undefined });
  await h.window.mavisOrders.open();
  assert.match(h.nodes.get('orders-rows').innerHTML, /Itens incompletos/);
  assert.match(h.nodes.get('orders-summary-receipt').textContent, /não disponível/);
});

test('a paid order with zero imported bundle prices shows pending prices without invented commission or receipt', async () => {
  const lines = [{ id: 1, shop_id: 1, item_name: 'Variação A', quantity: 1, unit_price: 0 }, { id: 2, shop_id: 1, item_name: 'Variação B', quantity: 1, unit_price: 0 }];
  const info = { ...order('BUNDLE'), total_amount: 41.27 };
  const h = harness({ respond: call => call.table === 'shopee_orders' ? { data: op(call, 'maybeSingle').length ? info : [{ ...info, shopee_order_items: lines }] } : call.table === 'shopee_order_items' ? { data: lines } : undefined });
  await h.window.mavisOrders.open(); h.clickDetail(0); await flush();
  assert.match(h.nodes.get('orders-rows').innerHTML, /Preço pendente de confirmação/);
  assert.match(h.nodes.get('orders-summary-receipt').textContent, /não disponível/);
  const html = h.nodes.get('orders-detail-body').innerHTML;
  assert.match(html, /Preço pendente/);
  assert.doesNotMatch(html.replace(/\s/g, ''), /R\$0,00|-R\$9,00|R\$4,50/);
});
