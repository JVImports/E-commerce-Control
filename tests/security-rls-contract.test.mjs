import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260717135438_close_public_data_api_exposure.sql';
const migration = await readFile(migrationPath, 'utf8');
const app = await readFile('app.js', 'utf8');

test('Gate 1 revokes anonymous Data API access and unrestricted policies', () => {
  assert.match(migration, /revoke all privileges on all tables in schema public from anon/i);
  assert.match(migration, /coalesce\(qual, ''\) = 'true'/i);
  assert.match(migration, /roles && array\['public', 'anon', 'authenticated'\]::name\[\]/i);
});

test('global commerce defaults are readable but never mutable', () => {
  assert.match(migration, /commerce_fee_settings_authenticated_select_v4/i);
  assert.match(migration, /commerce_fee_settings_owner_(insert|update|delete)_v4/i);
  assert.match(migration, /user_id is not null\s+and user_id = \(select auth\.uid\(\)\)/i);
});

test('tenant reads use account or shop membership', () => {
  assert.match(migration, /_account_member_select_v4/i);
  assert.match(migration, /member\.account_id = .*\.account_id/i);
  assert.match(migration, /_shop_member_select_v4/i);
  assert.match(migration, /member\.account_id = shop\.account_id/i);
});

test('legacy tokens are excluded from browser-visible shop reads', () => {
  const safeView = migration.match(/create or replace view public\.shopee_shops_safe[\s\S]*?from public\.shopee_shops;/i)?.[0] || '';
  assert.ok(safeView, 'token-free shop view exists');
  assert.doesNotMatch(safeView, /access_token|refresh_token/i);
  assert.match(migration, /has_column_privilege\('authenticated'.*'access_token'.*'select'\)/i);
  assert.match(app, /\.from\('shopee_shops_safe'\)/);
});
