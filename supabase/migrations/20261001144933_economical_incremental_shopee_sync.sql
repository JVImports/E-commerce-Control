-- Deploy the updated Edge Functions, then enable the existing scheduler job.
-- Preserve historical commerce data and the old cron definitions for rollback.
alter table public.shopee_sync_schedules add column if not exists enabled boolean not null default true;
alter table public.shopee_sync_schedules drop constraint shopee_sync_schedules_initial_action_check;
alter table public.shopee_sync_schedules add constraint shopee_sync_schedules_initial_action_check
  check (initial_action in ('sync-catalog','sync-orders-step','sync-orders-batch','sync-financial','sync-product-ads'));
create index if not exists sync_runs_account_started_idx on public.sync_runs(account_id, started_at desc);

update public.shopee_sync_schedules
set enabled = false, status = 'pending', lease_expires_at = null,
    cadence_minutes = case action when 'sync-orders-step' then 30 when 'sync-financial' then 120 when 'sync-catalog' then 720 else cadence_minutes end,
    priority = case action when 'sync-orders-step' then 40 when 'sync-financial' then 20 else 10 end,
    initial_action = case when action = 'sync-orders-step' then 'sync-orders-step' else initial_action end,
    initial_payload = case when action = 'sync-orders-step' then '{}'::jsonb else initial_payload end,
    initial_pending = case when action = 'sync-orders-step' then false else initial_pending end,
    updated_at = now();

do $$
declare job record;
begin
  for job in select jobid from cron.job where jobname like 'shopee-sync-%' loop
    perform cron.alter_job(job_id := job.jobid, active := false);
  end loop;
  for job in select jobid from cron.job where jobname = 'mavis-shopee-multishop-scheduler-every-minute' loop
    perform cron.alter_job(job_id := job.jobid, schedule := '*/5 * * * *', active := false);
  end loop;
end;
$$;

create or replace function private.enqueue_shopee_sync_schedules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.authorization_id is not distinct from new.authorization_id then return new; end if;
  if new.provider <> 'shopee' or new.environment <> 'live' then return new; end if;
  if new.status <> 'active' then
    update public.shopee_sync_schedules set enabled = false, updated_at = now() where connection_id = new.id;
    return new;
  end if;
  insert into public.shopee_sync_schedules (
    account_id, connection_id, action, initial_action, initial_payload, payload,
    cadence_minutes, priority, initial_pending, enabled, next_run_at
  ) values
    (new.account_id,new.id,'sync-orders-step','sync-orders-step','{}'::jsonb,'{}'::jsonb,30,40,false,true,now()),
    (new.account_id,new.id,'sync-financial','sync-financial','{"batch_size":50}'::jsonb,'{"batch_size":50}'::jsonb,120,20,false,true,now() + interval '10 minutes'),
    (new.account_id,new.id,'sync-catalog','sync-catalog','{}'::jsonb,'{}'::jsonb,720,10,false,true,now() + interval '20 minutes')
  on conflict (connection_id,action) do update set
    cadence_minutes=excluded.cadence_minutes,priority=excluded.priority,initial_action=excluded.initial_action,
    initial_payload=excluded.initial_payload,payload=excluded.payload,initial_pending=false,
    enabled=true,status='pending',attempts=0,next_run_at=excluded.next_run_at,
    lease_expires_at=null,last_error=null,updated_at=now();
  return new;
end;
$$;

create or replace function public.shopee_sync_storage_bytes()
returns bigint language sql security invoker set search_path = '' as $$
  select pg_catalog.pg_database_size(pg_catalog.current_database());
$$;
revoke all on function public.shopee_sync_storage_bytes() from public, anon, authenticated;
grant execute on function public.shopee_sync_storage_bytes() to service_role;

create or replace function public.upsert_shopee_order_page(p_connection_id uuid, p_orders jsonb, p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare shop bigint;
begin
  select external_shop_id into shop from public.shopee_connections where id=p_connection_id and status='active';
  if shop is null then raise exception 'Active connection not found'; end if;
  if p_orders is null or p_items is null or jsonb_typeof(p_orders) <> 'array' or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid order page';
  end if;
  if jsonb_array_length(p_orders)>100 or jsonb_array_length(p_items)>5000
    or octet_length(p_orders::text)+octet_length(p_items::text)>10000000 then
    raise exception 'Invalid order page';
  end if;
  if exists(select 1 from jsonb_array_elements(p_orders) o where (o->>'shop_id')::bigint is distinct from shop or nullif(o->>'order_sn','') is null)
    or exists(select 1 from jsonb_array_elements(p_items) i where (i->>'shop_id')::bigint is distinct from shop
      or not exists(select 1 from jsonb_array_elements(p_orders) o where o->>'order_sn'=i->>'order_sn')) then
    raise exception 'Order page does not belong to this connection';
  end if;
  insert into public.shopee_orders (shop_id,order_sn,status,buyer_username,total_amount,payment_method,items_summary,shipping_address,created_at,updated_at,synced_at)
  select shop,order_sn,status,buyer_username,total_amount,payment_method,items_summary,shipping_address,created_at,updated_at,synced_at
  from jsonb_to_recordset(p_orders) as r(order_sn text,status text,buyer_username text,total_amount numeric,payment_method text,items_summary text,shipping_address text,created_at timestamptz,updated_at timestamptz,synced_at timestamptz)
  on conflict(shop_id,order_sn) do update set status=excluded.status,buyer_username=excluded.buyer_username,
    total_amount=excluded.total_amount,payment_method=excluded.payment_method,items_summary=excluded.items_summary,
    shipping_address=excluded.shipping_address,created_at=excluded.created_at,updated_at=excluded.updated_at,synced_at=excluded.synced_at;
  -- Replace items only for completely fetched, changed orders in this transaction.
  delete from public.shopee_order_items where shop_id=shop and order_sn in (select o->>'order_sn' from jsonb_array_elements(p_orders) o);
  insert into public.shopee_order_items (shop_id,line_key,order_sn,item_id,model_id,item_name,model_name,quantity,unit_price)
  select shop,line_key,order_sn,item_id,model_id,item_name,model_name,quantity,unit_price
  from jsonb_to_recordset(p_items) as r(line_key text,order_sn text,item_id bigint,model_id bigint,item_name text,model_name text,quantity integer,unit_price numeric);
end;
$$;
revoke all on function public.upsert_shopee_order_page(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.upsert_shopee_order_page(uuid,jsonb,jsonb) to service_role;

-- Preserve a chosen display name when the same shop is reauthorized through OAuth.
do $$
declare definition text;
begin
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='finalize_shopee_oauth_v3') then
    raise exception 'OAuth finalization function not found';
  end if;
  for definition in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='finalize_shopee_oauth_v3' loop
    if position('metadata=excluded.metadata' in definition)>0 then
      execute replace(definition,'metadata=excluded.metadata','metadata=public.shopee_connections.metadata||excluded.metadata');
    elsif position('metadata=public.shopee_connections.metadata||excluded.metadata' in definition)=0 then
      raise exception 'Unexpected OAuth metadata update; review required';
    end if;
  end loop;
end;
$$;
