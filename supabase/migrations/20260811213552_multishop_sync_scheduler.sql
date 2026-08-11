-- Local-only preparation for the multishop scheduler. This migration deliberately
-- does not create a cron job: deploy the two Edge Functions and follow the runbook
-- before enabling the scheduler in production.

create table if not exists public.shopee_sync_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  connection_id uuid not null,
  action text not null check (action in ('sync-catalog', 'sync-orders-step', 'sync-financial', 'sync-product-ads')),
  initial_action text not null check (initial_action in ('sync-catalog', 'sync-orders-batch', 'sync-financial', 'sync-product-ads')),
  initial_payload jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  cadence_minutes integer not null check (cadence_minutes between 5 and 1440),
  priority integer not null default 0,
  initial_pending boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'running')),
  attempts integer not null default 0 check (attempts >= 0),
  next_run_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text check (last_status in ('success', 'error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, action),
  foreign key (connection_id, account_id)
    references public.shopee_connections(id, account_id) on delete cascade
);

create index if not exists shopee_sync_schedules_due_idx
  on public.shopee_sync_schedules(status, next_run_at, priority desc);

alter table public.sync_runs
  add column if not exists connection_id uuid;

alter table public.sync_cursors
  add column if not exists connection_id uuid;

create index if not exists sync_runs_connection_started_idx
  on public.sync_runs(connection_id, started_at desc);

create index if not exists sync_cursors_connection_module_idx
  on public.sync_cursors(connection_id, module, updated_at desc);

insert into public.sync_cursors (account_id, shop_id, module, cursor_key, cursor_value, updated_at)
select account_id,
       split_part(key, ':', 1)::bigint,
       'shopee-v3',
       split_part(key, ':', 2),
       value,
       updated_at
from public.sync_state
where key ~ '^[0-9]+:[^:]+$'
on conflict (shop_id, module, cursor_key) do update
  set cursor_value = excluded.cursor_value,
      account_id = excluded.account_id,
      updated_at = excluded.updated_at;

update public.sync_cursors cursor
set connection_id = connection.id
from public.shopee_connections connection
where cursor.connection_id is null
  and cursor.shop_id = connection.external_shop_id
  and (cursor.account_id is null or cursor.account_id = connection.account_id);

alter table public.shopee_sync_schedules enable row level security;
revoke all on table public.shopee_sync_schedules from anon, authenticated;

create or replace function private.enqueue_shopee_sync_schedules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider <> 'shopee' or new.environment <> 'live' or new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.authorization_id is not distinct from new.authorization_id then
    return new;
  end if;

  insert into public.shopee_sync_schedules (
    account_id, connection_id, action, initial_action, initial_payload, payload,
    cadence_minutes, priority, initial_pending, next_run_at
  ) values
    (new.account_id, new.id, 'sync-catalog', 'sync-catalog', '{}'::jsonb, '{}'::jsonb, 360, 40, true, now()),
    (new.account_id, new.id, 'sync-orders-step', 'sync-orders-batch', '{"months":3}'::jsonb, '{}'::jsonb, 10, 30, true, now()),
    (new.account_id, new.id, 'sync-financial', 'sync-financial', '{"months":1,"batch_size":50}'::jsonb, '{"months":1,"batch_size":50}'::jsonb, 30, 20, true, now()),
    (new.account_id, new.id, 'sync-product-ads', 'sync-product-ads', '{"days":30}'::jsonb, '{"days":30}'::jsonb, 360, 10, true, now())
  on conflict (connection_id, action) do update
    set account_id = excluded.account_id,
        initial_action = excluded.initial_action,
        initial_payload = excluded.initial_payload,
        payload = excluded.payload,
        cadence_minutes = excluded.cadence_minutes,
        priority = excluded.priority,
        initial_pending = true,
        status = 'pending',
        attempts = 0,
        next_run_at = now(),
        lease_expires_at = null,
        last_error = null,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists enqueue_shopee_sync_schedules on public.shopee_connections;
create trigger enqueue_shopee_sync_schedules
after insert or update of status, authorization_id on public.shopee_connections
for each row execute function private.enqueue_shopee_sync_schedules();

-- Existing active stores receive the same initial import as a newly authorized store.
insert into public.shopee_sync_schedules (
  account_id, connection_id, action, initial_action, initial_payload, payload,
  cadence_minutes, priority, initial_pending, next_run_at
)
select connection.account_id, connection.id, template.action, template.initial_action,
       template.initial_payload, template.payload, template.cadence_minutes,
       template.priority, true, now()
from public.shopee_connections connection
cross join (
  values
    ('sync-catalog'::text, 'sync-catalog'::text, '{}'::jsonb, '{}'::jsonb, 360, 40),
    ('sync-orders-step'::text, 'sync-orders-batch'::text, '{"months":3}'::jsonb, '{}'::jsonb, 10, 30),
    ('sync-financial'::text, 'sync-financial'::text, '{"months":1,"batch_size":50}'::jsonb, '{"months":1,"batch_size":50}'::jsonb, 30, 20),
    ('sync-product-ads'::text, 'sync-product-ads'::text, '{"days":30}'::jsonb, '{"days":30}'::jsonb, 360, 10)
) as template(action, initial_action, initial_payload, payload, cadence_minutes, priority)
where connection.provider = 'shopee'
  and connection.environment = 'live'
  and connection.status = 'active'
on conflict (connection_id, action) do nothing;
