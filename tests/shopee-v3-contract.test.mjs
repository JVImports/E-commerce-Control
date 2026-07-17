import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('OAuth v3 uses the production return origin and server-side credentials', async () => {
  const [oauth, callback] = await Promise.all([
    read('../supabase/functions/shopee-oauth-v3/index.ts'),
    read('../supabase/functions/shopee-oauth-callback-v3/index.ts')
  ]);
  assert.match(oauth, /https:\/\/ecommerce-control-jv\.netlify\.app/);
  assert.match(callback, /https:\/\/ecommerce-control-jv\.netlify\.app/);
  assert.doesNotMatch(oauth + callback, /mavis-hub\.netlify\.app/);
  assert.match(oauth, /create_shopee_oauth_state_v3/);
  assert.match(callback, /finalize_shopee_oauth_v3/);
});

test('Test Partner ID can use Sandbox without being sent to the Live endpoint', async () => {
  const [environment, oauth, callback, sync, migration] = await Promise.all([
    read('../supabase/functions/_shared/shopee-v3-environment.ts'),
    read('../supabase/functions/shopee-oauth-v3/index.ts'),
    read('../supabase/functions/shopee-oauth-callback-v3/index.ts'),
    read('../supabase/functions/shopee-sync-v3/index.ts'),
    read('../supabase/migrations/20260717193756_segregate_shopee_oauth_v3_environment.sql')
  ]);
  for (const source of [oauth, callback, sync]) {
    assert.match(source, /SHOPEE_THIRD_PARTY_ENVIRONMENT/);
    assert.match(source, /resolveShopeeV3Environment/);
  }
  assert.match(environment, /partner\.test-stable\.shopeemobile\.com/);
  assert.match(environment, /environment !== "live" && environment !== "sandbox"/);
  assert.match(oauth, /environment/);
  assert.match(callback, /p_environment/);
  assert.match(sync, /\.eq\("environment", SHOPEE_ENVIRONMENT\.environment\)/);
  assert.match(migration, /connection\.environment=p_environment/);
  assert.match(migration, /'third_party_v3_'\|\|p_environment/);
});

test('sync v3 reads Vault credentials and supports the launch modules', async () => {
  const sync = await read('../supabase/functions/shopee-sync-v3/index.ts');
  assert.match(sync, /get_shopee_authorization_tokens_v3/);
  assert.match(sync, /rotate_shopee_authorization_tokens_v3/);
  assert.match(sync, /SHOPEE_THIRD_PARTY_PARTNER_ID/);
  assert.match(sync, /account_id/);
  assert.match(sync, /connection_id/);
  for (const action of ['sync-catalog', 'sync-orders-batch', 'sync-financial', 'sync-product-ads']) {
    assert.match(sync, new RegExp(action));
  }
  assert.doesNotMatch(sync, /from\("shopee_apps"\)|from\("shopee_app_secrets"\)|from\("shopee_shops"\)/);
  assert.doesNotMatch(sync, /accessTokenPresent|refreshTokenPresent|accessTokenLength/);
});

test('reauthorization removes orphaned Vault tokens without revoking shared authorizations', async () => {
  const migration = await read('../supabase/migrations/20260717183200_cleanup_replaced_shopee_oauth_v3_authorizations.sql');
  assert.match(migration, /replaced_auth_ids/);
  assert.match(migration, /not exists\([\s\S]*connection\.status='active'/);
  assert.match(migration, /delete from vault\.secrets/);
  assert.match(migration, /set status='revoked'/);
  assert.match(migration, /to service_role/);
});
