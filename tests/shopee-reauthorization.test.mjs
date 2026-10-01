import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { readFile } from 'node:fs/promises';

const callback = await readFile(new URL('../supabase/functions/shopee-oauth-callback-v3/index.ts', import.meta.url), 'utf8');
function callbackHarness({ finalizeError, stateValid = true } = {}) {
  const calls = [], logs = [];
  const db = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'claim_shopee_oauth_state_v3') return { data: stateValid ? [{ return_path: '/?review=shopee' }] : [] };
    if (name === 'finalize_shopee_oauth_v3') return finalizeError ? { error: finalizeError } : { data: [{ authorization_id: 'test-authorization', connection_count: 1 }] };
    return {};
  } };
  const context = { Request, Response, URL, Date, TextEncoder, crypto: globalThis.crypto,
    createClient: () => db,
    resolveShopeeV3Environment: () => ({ environment: 'live', partnerOrigin: 'https://partner.example' }),
    Deno: { env: { get: key => key === 'SHOPEE_THIRD_PARTY_PARTNER_ID' ? '1' : key === 'MAVIS_SHOPEE_V3_ENABLED' ? 'true' : key === 'APP_RETURN_URL' ? 'https://app.example/' : 'test-only' }, serve: handler => { context.handler = handler; } },
    console: { error: (...args) => logs.push(args) },
    fakeExchange: async () => { calls.push({ name: 'exchange' }); return { access_token: 'LOCAL_TEST_ONLY', refresh_token: 'LOCAL_TEST_ONLY', expire_in: 14400 }; }
  };
  vm.runInNewContext(stripTypeScriptTypes(callback.replace(/^import[\s\S]*?;\r?\n/gm, ''), { mode: 'transform' }) + '\nexchangeCode = fakeExchange; globalThis.classify = callbackFailure;', context);
  return { calls, logs, classify: context.classify, run: () => context.handler(new Request('https://callback.example/?state=test-only&code=test-only&shop_id=1')) };
}

test('structured RPC errors redirect as a storage failure without logging details or tokens', async () => {
  const h = callbackHarness({ finalizeError: { code: '42702', message: 'authorization_id ambiguous PRIVATE_DETAILS', details: 'LOCAL_TEST_ONLY' } });
  const response = await h.run();
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://app.example');
  assert.equal(location.searchParams.get('shopee_code'), 'authorization_save_failed');
  assert.equal(h.calls.at(-1).name, 'fail_shopee_oauth_state_v3');
  assert.equal(h.calls.at(-1).args.p_error_code, 'authorization_save_failed');
  assert.match(JSON.stringify(h.logs), /42702/);
  assert.doesNotMatch(JSON.stringify(h.logs), /PRIVATE_DETAILS|LOCAL_TEST_ONLY/);
  assert.equal(h.classify({ code: 'PGRST203', message: 'ambiguous function' }).publicCode, 'authorization_save_failed');
  assert.equal(h.classify({ message: 'SHOP_ALREADY_CONNECTED' }).publicCode, 'shop_already_connected');
});

test('an invalid OAuth state cannot exchange a code or save tokens', async () => {
  const h = callbackHarness({ stateValid: false });
  const response = await h.run();
  assert.equal(new URL(response.headers.get('location')).searchParams.get('shopee_code'), 'state_invalid');
  assert.deepEqual(h.calls.map(call => call.name), ['claim_shopee_oauth_state_v3']);
});

test('a completed callback redirects successfully and passes the chosen environment to finalization', async () => {
  const h = callbackHarness(); const response = await h.run();
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('shopee_connection'), 'success');
  assert.equal(location.searchParams.get('shopee_code'), 'connected');
  assert.equal(h.calls.find(call => call.name === 'finalize_shopee_oauth_v3').args.p_environment, 'live');
  assert.equal(h.calls.some(call => call.name === 'fail_shopee_oauth_state_v3'), false);
});

test('the callback failure remains visible after authenticated integration bootstrap', async () => {
  const source = await readFile(new URL('../shopee-third-party-app.js', import.meta.url), 'utf8');
  const nodes = new Map();
  class Element {
    constructor() { this.dataset = {}; this.classList = { contains: () => false }; }
    set innerHTML(value) { this.html = value; for (const match of value.matchAll(/id="([^"]+)"/g)) if (!nodes.has(match[1])) nodes.set(match[1], new Element()); }
    get innerHTML() { return this.html; }
    addEventListener() {}
  }
  nodes.set('shopee-sync-view', new Element());
  const window = { location: { search: '?review=shopee&shopee_connection=error&shopee_code=authorization_save_failed', pathname: '/', hash: '' },
    history: { replaceState() {} }, addEventListener() {}, dispatchEvent() {},
    MAVIS_RUNTIME_CONFIG: { supabaseUrl: 'https://database.example' },
    supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: 'LOCAL_TEST_ONLY' } } }) } }
  };
  vm.runInNewContext(source, { window, document: { readyState: 'complete', getElementById: id => nodes.get(id) },
    URLSearchParams, CustomEvent: class {}, fetch: async url => ({ ok: true, json: async () => url.includes('mavis-integrations') ?
      { account: { id: 'account', name: 'Empresa', role: 'owner' }, integrations: [{ provider: 'shopee', status: 'inactive' }] } :
      { configured: true, environment: 'live', connections: [] } }) });
  await window.mavisIntegrations.refresh();
  assert.equal(window.mavisIntegrations.state.error, '');
  assert.match(window.mavisIntegrations.state.callbackError, /Não foi possível salvar/);
  assert.match(nodes.get('mavis-integrations-content').innerHTML, /Não foi possível salvar a autorização/);
  assert.doesNotMatch(nodes.get('mavis-integrations-content').innerHTML, /autorizada com sucesso/);
});
