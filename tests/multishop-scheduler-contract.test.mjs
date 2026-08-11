import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260811213552_multishop_sync_scheduler.sql', import.meta.url), 'utf8');
const scheduler = await readFile(new URL('../supabase/functions/shopee-sync-scheduler-v1/index.ts', import.meta.url), 'utf8');
const sync = await readFile(new URL('../supabase/functions/shopee-sync-v3/index.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const adsDisableMigration = await readFile(new URL('../supabase/migrations/20260811221736_disable_automatic_shopee_ads_sync.sql', import.meta.url), 'utf8');

assert.match(migration, /create table if not exists public\.shopee_sync_schedules/i);
assert.match(migration, /unique \(connection_id, action\)/i);
assert.match(migration, /create trigger enqueue_shopee_sync_schedules/i);
assert.match(migration, /sync-orders-batch/);
assert.doesNotMatch(migration, /cron\.schedule/i);
assert.match(scheduler, /MAVIS_SHOPEE_SCHEDULER_SECRET/);
assert.match(scheduler, /lease_expires_at/);
assert.match(scheduler, /status\.eq\.running/);
assert.match(scheduler, /shopee-sync-v3/);
assert.match(scheduler, /initial_pending/);
assert.match(scheduler, /sync_runs/);
assert.match(sync, /type RequestActor/);
assert.match(sync, /x-mavis-scheduler-secret/);
assert.match(sync, /Ação não permitida ao scheduler interno/);
assert.match(sync, /sync-orders-batch/);
assert.match(config, /\[functions\.shopee-sync-scheduler-v1\]/);
assert.match(adsDisableMigration, /delete from public\.shopee_sync_schedules/i);
assert.doesNotMatch(adsDisableMigration, /sync-product-ads.*values/i);

console.log('Multishop scheduler contract checks passed.');
