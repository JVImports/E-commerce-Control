import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { readFile } from 'node:fs/promises';
import * as policy from '../supabase/functions/_shared/shopee-sync-policy.mjs';
import * as prices from '../supabase/functions/_shared/shopee-order-prices.mjs';

// Execute the actual Edge Function implementations with controlled network and DB boundaries.
const sources = Object.fromEntries(await Promise.all(['shopee-sync-v3', 'shopee-oauth-v3', 'shopee-sync-scheduler-v1'].map(async slug =>
  [slug, await readFile(new URL(`../supabase/functions/${slug}/index.ts`, import.meta.url), 'utf8')])));
function database(respond = () => ({ data: [], error: null })) {
  const calls = [];
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    from(table) {
      const call = { table, operations: [] };
      const q = { then(resolve, reject) { calls.push(call); return Promise.resolve(respond(call)).then(resolve, reject); } };
      for (const op of ['select', 'eq', 'is', 'in', 'gte', 'order', 'limit', 'single', 'maybeSingle', 'update', 'insert', 'or']) q[op] = (...args) => { call.operations.push([op, ...args]); return q; };
      return q;
    },
    rpc(name, args) { const call = { rpc: name, args }; calls.push(call); return Promise.resolve(respond(call)); }
  };
  return { db, calls };
}
function load(slug, db, names, replacements = {}) {
  const source = stripTypeScriptTypes(sources[slug].replace(/^import[\s\S]*?;\r?\n/gm, ''), { mode: 'transform' });
  const context = { ...policy, ...prices, Date, URL, Response, Request, AbortSignal, TextEncoder, crypto: globalThis.crypto,
    createClient: () => db, resolveShopeeV3Environment: () => ({ environment: 'live', partnerOrigin: 'https://partner.example', adsOrigin: 'https://ads.example' }),
    SHOPEE_LIVE_PARTNER_ORIGIN: 'https://partner.example', SHOPEE_SANDBOX_PARTNER_ORIGIN: 'https://sandbox.example', SHOPEE_LIVE_ADS_ORIGIN: 'https://ads.example',
    Deno: { env: { get: name => name === 'SHOPEE_THIRD_PARTY_ENVIRONMENT' ? 'live' : 'test-only' }, serve: fn => { context.handler = fn; } }, replacements };
  vm.runInNewContext(source + '\n' + Object.keys(replacements).map(name => `${name} = replacements.${name};`).join('\n') + '\nglobalThis.fns = {' + names.join(',') + '};', context);
  return { ...context.fns, handler: context.handler };
}
const shop = { shop_id: 11, connection_id: 'connection', authorization_id: 'authorization', account_id: 'account', auth_expires_at: null, token_expire_in: null, refresh_token: 'test-only' };
const detail = sn => ({ order_sn: sn, order_status: 'READY_TO_SHIP', create_time: 1000, update_time: 2000, total_amount: 20, item_list: [{ item_id: 1, model_id: 2, model_quantity_purchased: 1, model_discounted_price: 20, item_name: 'item' }] });

test('order prices preserve missing or bundle prices as unknown instead of zero or the original list price', () => {
  assert.equal(prices.orderItemPrice({ model_discounted_price: 0, model_original_price: 30 }), null);
  assert.equal(prices.orderItemPrice({ model_discounted_price: 30, promotion_type: 'bundle_deal' }), null);
  assert.equal(prices.orderItemPrice({ model_discounted_price: 30, promotion_list: [{ promotion_type: 'bundle_deal' }] }), null);
  assert.equal(prices.orderItemPrice({}), null);
  assert.equal(prices.orderItemPrice({ model_original_price: 25 }), 25);
  assert.equal(prices.orderItemPrice({ model_discounted_price: 20, model_original_price: 30 }), 20);
  const { db } = database();
  const fn = load('shopee-sync-v3', db, ['buildOrderRecords']);
  const input = detail('BUNDLE'); input.item_list[0].model_discounted_price = 0;
  assert.equal(fn.buildOrderRecords(shop, [input]).itemRows[0].unit_price, null);
});

test('financial item subtotals are divided by matching purchased quantity without guessing ambiguous or fractional-cent prices', () => {
  const item = { item_id: 1, model_id: 2, quantity: 2 };
  const financial = { item_id: 1, model_id: 2, quantity_purchased: 2, discounted_price: 39.98 };
  assert.equal(prices.escrowItemPrice(item, [financial]), 19.99);
  for (const lines of [null, [], [financial, financial], [{ ...financial, model_id: 3 }], [{ ...financial, quantity_purchased: 1 }], [{ ...financial, discounted_price: 39.99 }], [{ ...financial, discounted_price: null }]]) assert.equal(prices.escrowItemPrice(item, lines), null);
});

test('financial price repairs only update unresolved prices in the authorized shop and preserve concurrently confirmed prices', async () => {
  const item = { id: 10, order_sn: 'BUNDLE', item_id: 1, model_id: 2, quantity: 2, unit_price: 0 };
  const { db, calls } = database(call => ({ data: call.operations.some(op => op[0] === 'update') ? [] : [item], error: null }));
  const fn = load('shopee-sync-v3', db, ['repairEscrowItemPrices']);
  const count = await fn.repairEscrowItemPrices(shop, new Map([['BUNDLE', { items: [{ item_id: 1, model_id: 2, quantity_purchased: 2, discounted_price: 39.98 }] }]]));
  assert.equal(count, 0, 'a concurrent update means the old-price condition no longer matches');
  assert.equal(calls.length, 2);
  const write = calls[1].operations;
  assert.equal(write.find(op => op[0] === 'update')[1].unit_price, 19.99);
  for (const [key, value] of [['shop_id', 11], ['order_sn', 'BUNDLE'], ['id', 10], ['quantity', 2], ['unit_price', 0]]) assert.ok(write.some(op => op[0] === 'eq' && op[1] === key && op[2] === value));
});

test('the existing financial batch repairs nullable prices before saving escrow and retains missing escrow on a failed repair', async () => {
  for (const failed of [false, true]) {
    const { db, calls } = database(call => call.operations.some(op => op[0] === 'update') ? { data: [{ id: 10 }], error: failed ? new Error('write failed') : null } : { data: [{ id: 10, order_sn: 'BUNDLE', item_id: 1, model_id: 2, quantity: 2, unit_price: null }], error: null });
    let saved = false;
    const fn = load('shopee-sync-v3', db, ['syncEscrowStep'], {
      logSync: async () => {}, refreshAccessToken: async () => 'test-only',
      getOrdersMissingEscrow: async () => ['BUNDLE'],
      getEscrowDetail: async () => ({ items: [{ item_id: 1, model_id: 2, quantity_purchased: 2, discounted_price: 39.98 }] }),
      upsertBatches: async () => { assert.ok(calls.some(call => call.operations.some(op => op[0] === 'update'))); saved = true; return 1; }
    });
    if (failed) { await assert.rejects(fn.syncEscrowStep(shop, {}), /write failed/); assert.equal(saved, false); }
    else { const result = await fn.syncEscrowStep(shop, {}); assert.equal(saved, true); assert.equal(result.pricesRepaired, 1); }
    assert.ok(calls[1].operations.some(op => op[0] === 'is' && op[1] === 'unit_price' && op[2] === null));
  }
});
function incremental({ pages = [], missing = false, missingItems = false, writeError = null, existing = [], watermark = '1000', pending = '' } = {}) {
  const states = new Map([['orders_updated_until', watermark], ['orders_update_window', pending]]);
  const writes = [], requests = [];
  const { db, calls } = database(call => call.rpc ? { error: writeError } : { data: existing, error: null });
  const fn = load('shopee-sync-v3', db, ['syncOrdersIncremental', 'buildOrderRecords'], {
    refreshAccessToken: async () => 'test-only', getSyncState: async (_, key) => states.get(key),
    setSyncState: async (_, key, value) => { writes.push([key, value]); states.set(key, value); },
    shopeeRequest: async req => { requests.push(req); return { response: pages.shift() }; },
    getOrderDetails: async (_, __, ___, sns) => missing ? [] : sns.map(sn => missingItems ? { ...detail(sn), item_list: undefined } : detail(sn))
  });
  return { ...fn, calls, states, writes, requests, run: () => fn.syncOrdersIncremental(shop, {}) };
}

test('order windows overlap safely, remain within 14 days, and resume the exact unfinished cursor', () => {
  const now = 2000000;
  assert.deepEqual(policy.orderWindow(now, '1900000', null, 0), { from: 1899700, to: 1999940, cursor: '' });
  const cold = policy.orderWindow(now, '', null, 1950000);
  assert.equal(cold.from, 1949700);
  const old = policy.orderWindow(now, '1000', null, 0);
  assert.equal(old.to - old.from, 14 * 86400);
  const pending = { ...old, cursor: 'page2' };
  assert.equal(policy.orderWindow(now, '1000', pending, 0), pending);
  assert.notEqual(policy.orderWindow(now, '1000', { ...pending, to: now + 1 }, 0).cursor, 'page2');
});

test('unchanged order versions do not rewrite overlap pages; meaningful changes do', () => {
  const row = { created_at: '2026-09-30T10:00:00Z', updated_at: '2026-09-30T11:00:00Z', total_amount: 20, status: 'SHIPPED' };
  assert.equal(policy.sameOrderVersion(row, { ...row, total_amount: '20.00', updated_at: '2026-09-30T08:00:00-03:00', synced_at: 'older' }), true);
  for (const patch of [{ status: 'COMPLETED' }, { total_amount: 21 }, { updated_at: '2026-09-30T12:00:00Z' }]) assert.equal(policy.sameOrderVersion(row, { ...row, ...patch }), false);
  assert.equal(policy.sameOrderVersion(row, null), false);
});

test('a busy window stops at three pages, persists its cursor, and never advances the completed watermark', async () => {
  const h = incremental({ pages: ['a', 'b', 'c', 'd'].map((sn, i) => ({ order_list: [{ order_sn: sn }], more: true, next_cursor: `p${i + 1}` })) });
  const result = await h.run();
  assert.equal(result.ordersUpserted, 3); assert.equal(result.hasMore, true); assert.equal(h.requests.length, 3);
  assert.equal(h.states.get('orders_updated_until'), '1000');
  assert.equal(JSON.parse(h.states.get('orders_update_window')).cursor, 'p3');
  assert.equal(h.requests[1].params.cursor, 'p1');
  assert.equal(h.requests[0].params.time_range_field, 'update_time');
  assert.equal(h.calls.filter(c => c.rpc === 'upsert_shopee_order_page').length, 3);
});

test('incomplete details, failed atomic writes and nonadvancing pagination retain checkpoints', async () => {
  for (const config of [
    { missing: true, pages: [{ order_list: [{ order_sn: 'a' }], more: false }] },
    { missingItems: true, pages: [{ order_list: [{ order_sn: 'a' }], more: false }] },
    { writeError: new Error('DB write failed'), pages: [{ order_list: [{ order_sn: 'a' }], more: false }] },
    { pages: [{ order_list: [], more: true, next_cursor: '' }] },
    { pages: [{ more: false }] }
  ]) {
    const h = incremental(config); await assert.rejects(h.run());
    assert.equal(h.writes.length, 0);
    assert.equal(h.states.get('orders_updated_until'), '1000');
  }
});

test('a completed recent window advances even when empty and does not incorrectly request another backlog run', async () => {
  const h = incremental({ watermark: String(Math.floor(Date.now() / 1000) - 3600), pages: [{ order_list: [], more: false }] });
  const result = await h.run();
  assert.equal(result.hasMore, false); assert.equal(result.ordersChecked, 0);
  assert.equal(h.states.get('orders_update_window'), '');
  assert.equal(h.calls.length, 0);
});

test('an already stored order does not call the atomic write RPC', async () => {
  const h = incremental({ pages: [{ order_list: [{ order_sn: 'a' }], more: false }] });
  const row = h.buildOrderRecords(shop, [detail('a')]).orderRows[0];
  const same = incremental({ existing: [row], pages: [{ order_list: [{ order_sn: 'a' }], more: false }] });
  const result = await same.run();
  assert.equal(result.ordersChecked, 1); assert.equal(result.ordersUpserted, 0);
  assert.equal(same.calls.filter(c => c.rpc).length, 0);
});

test('token rotation accepts a Shopee response with no refresh expiry and keeps it unknown', async () => {
  const { db, calls } = database(() => ({ error: null }));
  const fn = load('shopee-sync-v3', db, ['refreshAccessToken'], { shopeeRequest: async () => ({ access_token: 'test-access', refresh_token: 'test-refresh', expire_in: 14400 }) });
  assert.equal(await fn.refreshAccessToken(shop, { partnerId: 1 }), 'test-access');
  const rotation = calls.find(c => c.rpc === 'rotate_shopee_authorization_tokens_v3');
  assert.ok(rotation);
  assert.equal(rotation.args.p_refresh_expires_at, null);
});

test('renaming is tenant scoped, preserves metadata, rejects viewers and invalid names', async () => {
  function h(role = 'admin') {
    const { db, calls } = database(call => ({ data: call.table === 'account_members' ? [{ account_id: 'account', role }] : { id: 'connection', metadata: { existing: true } }, error: null }));
    return { ...load('shopee-oauth-v3', db, ['renameConnection']), calls };
  }
  const valid = h(); await valid.renameConnection('user', { account_id: 'account', connection_id: 'connection', display_name: ' Loja nova ' });
  const write = valid.calls.find(c => c.operations.some(op => op[0] === 'update'));
  assert.equal(write.operations.find(op => op[0] === 'update')[1].metadata.display_name, 'Loja nova');
  assert.equal(write.operations.find(op => op[0] === 'update')[1].metadata.existing, true);
  assert.ok(write.operations.some(op => op[0] === 'eq' && op[1] === 'account_id' && op[2] === 'account'));
  for (const [role, body] of [['viewer', { display_name: 'Loja' }], ['admin', { account_id: 'other', display_name: 'Loja' }], ['admin', { display_name: '' }], ['admin', { display_name: 'x'.repeat(81) }], ['admin', { display_name: 'x\ny' }]]) {
    const denied = h(role); await assert.rejects(denied.renameConnection('user', { account_id: 'account', connection_id: 'connection', ...body }));
    assert.equal(denied.calls.filter(c => c.operations.some(op => op[0] === 'update')).length, 0);
  }
});

test('permanent failures pause immediately and transient errors stop after five attempts', () => {
  assert.equal(policy.syncFailure('partner_key_expired', 1).pause, true);
  assert.equal(policy.syncFailure('reauthorization_required', 1).pause, true);
  assert.equal(policy.syncFailure('shopee_unavailable', 4).pause, false);
  assert.equal(policy.syncFailure('shopee_unavailable', 5).pause, true);
  assert.equal(policy.shopeeFailure('error_partner_key_expired', 403).code, 'partner_key_expired');
  assert.equal(policy.shopeeFailure('refresh_token_expired', 403).code, 'reauthorization_required');
});

test('scheduler budget allows ordinary runs, defers at the daily limit and pauses account jobs near storage capacity', async () => {
  for (const [bytes, count, allowed] of [[300000000, 124, true], [300000000, 160, false], [450000000, 1, false]]) {
    const { db, calls } = database(c => c.rpc ? { data: bytes } : c.table === 'sync_runs' ? { count } : { error: null });
    const fn = load('shopee-sync-scheduler-v1', db, ['budgetAllows']);
    assert.equal(await fn.budgetAllows({ id: 'schedule', account_id: 'account' }), allowed);
    const update = calls.find(c => c.table === 'shopee_sync_schedules');
    if (allowed) assert.equal(update, undefined);
    else {
      assert.equal(update.operations.find(op => op[0] === 'update')[1].enabled, bytes < 450000000);
      assert.equal(update.operations.some(op => op[0] === 'eq' && op[1] === 'id'), bytes < 450000000);
    }
  }
  const { db } = database(c => c.rpc ? { data: null } : { count: 0 });
  await assert.rejects(load('shopee-sync-scheduler-v1', db, ['budgetAllows']).budgetAllows({ account_id: 'account' }));
});

test('scheduler filters inactive jobs before leasing and delays pending pages by only five minutes', async () => {
  const { db, calls } = database(() => ({ data: [], error: null }));
  const fn = load('shopee-sync-scheduler-v1', db, ['nextDueSchedule', 'finish']);
  assert.equal(await fn.nextDueSchedule(), null);
  for (const [column, value] of [['enabled', true], ['connection.status', 'active'], ['connection.environment', 'live']]) assert.ok(calls[0].operations.some(op => op[0] === 'eq' && op[1] === column && op[2] === value));
  const before = Date.now();
  await fn.finish({ id: 'schedule', cadence_minutes: 30 }, 'run', { action: 'sync-orders-step', result: { hasMore: true } });
  const write = calls[1].operations.find(op => op[0] === 'update')[1];
  assert.ok(new Date(write.next_run_at).getTime() - before >= 5 * 60000);
  assert.ok(new Date(write.next_run_at).getTime() - before < 6 * 60000);
});
