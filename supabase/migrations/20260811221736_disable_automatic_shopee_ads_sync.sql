-- Third-party Shopee authorization does not provide Ads API access in this project.
-- Ads data is imported by the protected shopee-ads-import-v1 report workflow instead.

delete from public.shopee_sync_schedules
where action = 'sync-product-ads';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'shopee-sync-ads-balance-every-6-hours') then
    perform cron.unschedule('shopee-sync-ads-balance-every-6-hours');
  end if;
  if exists (select 1 from cron.job where jobname = 'shopee-sync-ads-daily-step-hourly') then
    perform cron.unschedule('shopee-sync-ads-daily-step-hourly');
  end if;
end;
$$;

create or replace function private.enqueue_shopee_sync_schedules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider <> 'shopee' or new.environment <> 'live' or new.status <> 'active' then
    return new;
  end if;

  insert into public.shopee_sync_schedules (
    account_id, connection_id, action, initial_action, initial_payload, payload,
    cadence_minutes, priority, initial_pending, next_run_at
  ) values
    (new.account_id, new.id, 'sync-catalog', 'sync-catalog', '{}'::jsonb, '{}'::jsonb, 360, 40, true, now()),
    (new.account_id, new.id, 'sync-orders-step', 'sync-orders-batch', '{"months":3}'::jsonb, '{}'::jsonb, 10, 30, true, now()),
    (new.account_id, new.id, 'sync-financial', 'sync-financial', '{"months":1,"batch_size":50}'::jsonb, '{"months":1,"batch_size":50}'::jsonb, 30, 20, true, now())
  on conflict (connection_id, action) do update
    set account_id = excluded.account_id,
        initial_action = excluded.initial_action,
        initial_payload = excluded.initial_payload,
        payload = excluded.payload,
        cadence_minutes = excluded.cadence_minutes,
        priority = excluded.priority,
        initial_pending = case
          when public.shopee_sync_schedules.last_status = 'success' then false
          else public.shopee_sync_schedules.initial_pending
        end,
        next_run_at = least(public.shopee_sync_schedules.next_run_at, now()),
        updated_at = now();

  return new;
end;
$$;
