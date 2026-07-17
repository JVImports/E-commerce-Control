-- Third-party Shopee OAuth v3 foundation.
-- Additive rollout: legacy v2 tables, triggers, tokens and functions remain untouched.

create schema if not exists private;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.account_members'::regclass
      and conname = 'account_members_role_v3_check'
  ) then
    alter table public.account_members
      add constraint account_members_role_v3_check
      check (role in ('owner','admin','client'));
  end if;
end
$$;

alter table public.account_members enable row level security;
drop policy if exists account_members_self_select_v3 on public.account_members;
create policy account_members_self_select_v3
  on public.account_members for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.accounts enable row level security;
drop policy if exists accounts_member_select_v3 on public.accounts;
create policy accounts_member_select_v3
  on public.accounts for select to authenticated
  using (
    exists (
      select 1 from public.account_members member
      where member.account_id = accounts.id
        and member.user_id = (select auth.uid())
    )
  );

create table if not exists public.shopee_authorizations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider_app_key text not null default 'third_party_v3',
  environment text not null default 'live' check (environment in ('live','sandbox')),
  region text not null default 'BR',
  partner_id bigint not null,
  status text not null default 'active'
    check (status in ('pending','active','reauthorization_required','revoked','error')),
  authorized_by_user_id uuid references auth.users(id) on delete set null,
  authorized_at timestamptz,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shopee_authorizations_account_status_idx
  on public.shopee_authorizations(account_id,status);

create table if not exists public.shopee_connections (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid references public.shopee_authorizations(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null default 'shopee' check (provider = 'shopee'),
  environment text not null default 'live' check (environment in ('live','sandbox')),
  region text not null default 'BR',
  external_shop_id bigint not null,
  shop_name text not null default 'Loja Shopee',
  status text not null default 'active'
    check (status in ('legacy_pending_reauth','pending','active','reauthorization_required','revoked','disabled','error')),
  authorized_by_user_id uuid references auth.users(id) on delete set null,
  authorized_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  legacy_source boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider,environment,region,external_shop_id),
  unique (id,account_id)
);
create index if not exists shopee_connections_account_status_idx
  on public.shopee_connections(account_id,status);
create index if not exists shopee_connections_authorization_idx
  on public.shopee_connections(authorization_id);
create index if not exists shopee_connections_authorized_by_idx
  on public.shopee_connections(authorized_by_user_id);

create table if not exists private.shopee_authorization_tokens (
  authorization_id uuid primary key references public.shopee_authorizations(id) on delete cascade,
  access_token_secret_id uuid not null unique,
  refresh_token_secret_id uuid not null unique,
  token_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.shopee_authorization_tokens enable row level security;
revoke all on private.shopee_authorization_tokens from public, anon, authenticated;

create table if not exists private.shopee_oauth_states_v3 (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider_app_key text not null default 'third_party_v3',
  return_path text not null default '/',
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  claimed_at timestamptz,
  completed_at timestamptz,
  result_authorization_id uuid references public.shopee_authorizations(id) on delete set null,
  error_code text
);
create index if not exists shopee_oauth_states_v3_expiry_idx
  on private.shopee_oauth_states_v3(expires_at)
  where status = 'pending';
alter table private.shopee_oauth_states_v3 enable row level security;
revoke all on private.shopee_oauth_states_v3 from public, anon, authenticated;

insert into public.shopee_connections(
  account_id,provider,environment,region,external_shop_id,shop_name,status,
  authorized_by_user_id,authorized_at,legacy_source,metadata
)
select distinct on (shop.account_id,shop.shop_id)
  shop.account_id,'shopee','live',coalesce(shop.region,'BR'),shop.shop_id,
  coalesce(nullif(shop.shop_name,''),'Shopee ' || shop.shop_id::text),
  'legacy_pending_reauth',shop.user_id,shop.created_at,true,
  jsonb_build_object('legacy_table','shopee_shops')
from public.shopee_shops shop
where shop.account_id is not null
order by shop.account_id,shop.shop_id,shop.updated_at desc nulls last
on conflict (provider,environment,region,external_shop_id) do nothing;

create table if not exists public.shopee_ads_import_batches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  connection_id uuid not null,
  shop_id bigint not null,
  report_kind text not null default 'product_daily',
  schema_version integer not null default 1,
  file_name text not null,
  content_sha256 text not null,
  period_start date,
  period_end date,
  row_count integer not null default 0,
  replace_period boolean not null default true,
  status text not null default 'processing'
    check (status in ('processing','completed','failed')),
  validation_summary jsonb not null default '{}'::jsonb,
  error_message text,
  imported_by_user_id uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (account_id,shop_id,content_sha256),
  foreign key (connection_id,account_id)
    references public.shopee_connections(id,account_id) on delete cascade
);
create index if not exists shopee_ads_import_batches_account_date_idx
  on public.shopee_ads_import_batches(account_id,imported_at desc);

create table if not exists public.shopee_ads_manual_daily (
  id bigint generated by default as identity primary key,
  batch_id uuid not null references public.shopee_ads_import_batches(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  connection_id uuid not null,
  shop_id bigint not null,
  performance_date date not null,
  campaign_id text not null default '',
  campaign_name text,
  item_id bigint not null default 0,
  model_id bigint not null default 0,
  placement_key text not null default '',
  source_row_hash text,
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  orders bigint not null default 0 check (orders >= 0),
  expense numeric(18,4) not null default 0 check (expense >= 0),
  direct_gmv numeric(18,4) not null default 0 check (direct_gmv >= 0),
  broad_gmv numeric(18,4) not null default 0 check (broad_gmv >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id,shop_id,performance_date,campaign_id,item_id,model_id,placement_key),
  foreign key (connection_id,account_id)
    references public.shopee_connections(id,account_id) on delete cascade
);
create index if not exists shopee_ads_manual_daily_shop_date_idx
  on public.shopee_ads_manual_daily(account_id,shop_id,performance_date desc);

alter table public.shopee_authorizations enable row level security;
alter table public.shopee_connections enable row level security;
alter table public.shopee_ads_import_batches enable row level security;
alter table public.shopee_ads_manual_daily enable row level security;

drop policy if exists shopee_authorizations_member_select_v3 on public.shopee_authorizations;
create policy shopee_authorizations_member_select_v3
  on public.shopee_authorizations for select to authenticated
  using (exists (
    select 1 from public.account_members member
    where member.account_id = shopee_authorizations.account_id
      and member.user_id = (select auth.uid())
  ));

drop policy if exists shopee_connections_member_select_v3 on public.shopee_connections;
create policy shopee_connections_member_select_v3
  on public.shopee_connections for select to authenticated
  using (exists (
    select 1 from public.account_members member
    where member.account_id = shopee_connections.account_id
      and member.user_id = (select auth.uid())
  ));

drop policy if exists shopee_ads_import_batches_member_select_v3 on public.shopee_ads_import_batches;
create policy shopee_ads_import_batches_member_select_v3
  on public.shopee_ads_import_batches for select to authenticated
  using (exists (
    select 1 from public.account_members member
    where member.account_id = shopee_ads_import_batches.account_id
      and member.user_id = (select auth.uid())
  ));

drop policy if exists shopee_ads_manual_daily_member_select_v3 on public.shopee_ads_manual_daily;
create policy shopee_ads_manual_daily_member_select_v3
  on public.shopee_ads_manual_daily for select to authenticated
  using (exists (
    select 1 from public.account_members member
    where member.account_id = shopee_ads_manual_daily.account_id
      and member.user_id = (select auth.uid())
  ));

revoke insert,update,delete on public.shopee_authorizations,public.shopee_connections,
  public.shopee_ads_import_batches,public.shopee_ads_manual_daily from anon,authenticated;
grant select on public.shopee_authorizations,public.shopee_connections,
  public.shopee_ads_import_batches,public.shopee_ads_manual_daily to authenticated;

create or replace function public.create_shopee_oauth_state_v3(
  p_state_hash text,p_user_id uuid,p_account_id uuid,p_return_path text,p_expires_at timestamptz
) returns void
language sql security definer set search_path = ''
as $$
  insert into private.shopee_oauth_states_v3(
    state_hash,user_id,account_id,return_path,expires_at
  ) values (p_state_hash,p_user_id,p_account_id,p_return_path,p_expires_at);
$$;

create or replace function public.claim_shopee_oauth_state_v3(p_state_hash text)
returns table(user_id uuid,account_id uuid,return_path text)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  update private.shopee_oauth_states_v3 state
     set status = 'processing',claimed_at = now()
   where state.state_hash = p_state_hash
     and state.status = 'pending'
     and state.expires_at > now()
  returning state.user_id,state.account_id,state.return_path;
end;
$$;

create or replace function public.fail_shopee_oauth_state_v3(
  p_state_hash text,p_error_code text
) returns void
language sql security definer set search_path = ''
as $$
  update private.shopee_oauth_states_v3
     set status='failed',completed_at=now(),error_code=left(p_error_code,120)
   where state_hash=p_state_hash and status='processing';
$$;

create or replace function public.finalize_shopee_oauth_v3(
  p_state_hash text,
  p_partner_id bigint,
  p_access_token text,
  p_refresh_token text,
  p_access_expires_at timestamptz,
  p_refresh_expires_at timestamptz,
  p_shop_ids bigint[]
) returns table(authorization_id uuid,connection_count integer)
language plpgsql security definer set search_path = ''
as $$
declare
  oauth private.shopee_oauth_states_v3%rowtype;
  auth_id uuid := gen_random_uuid();
  access_secret uuid;
  refresh_secret uuid;
  shop bigint;
  conflict_account uuid;
  changed integer := 0;
begin
  select * into oauth from private.shopee_oauth_states_v3
   where state_hash=p_state_hash and status='processing'
   for update;
  if oauth.state_hash is null then raise exception 'OAuth state is not processing'; end if;
  if coalesce(array_length(p_shop_ids,1),0)=0 then raise exception 'No shops returned'; end if;

  select connection.account_id into conflict_account
  from public.shopee_connections connection
  where connection.provider='shopee' and connection.environment='live'
    and connection.region='BR' and connection.external_shop_id=any(p_shop_ids)
    and connection.account_id<>oauth.account_id
  limit 1;
  if conflict_account is not null then raise exception 'SHOP_ALREADY_CONNECTED'; end if;

  insert into public.shopee_authorizations(
    id,account_id,provider_app_key,environment,region,partner_id,status,
    authorized_by_user_id,authorized_at,access_token_expires_at,refresh_token_expires_at
  ) values (
    auth_id,oauth.account_id,'third_party_v3','live','BR',p_partner_id,'active',
    oauth.user_id,now(),p_access_expires_at,p_refresh_expires_at
  );

  access_secret := vault.create_secret(
    p_access_token,'shopee_access_'||auth_id::text,'Shopee OAuth v3 access token'
  );
  refresh_secret := vault.create_secret(
    p_refresh_token,'shopee_refresh_'||auth_id::text,'Shopee OAuth v3 refresh token'
  );
  insert into private.shopee_authorization_tokens(
    authorization_id,access_token_secret_id,refresh_token_secret_id
  ) values (auth_id,access_secret,refresh_secret);

  foreach shop in array p_shop_ids loop
    insert into public.shopee_connections(
      authorization_id,account_id,provider,environment,region,external_shop_id,
      shop_name,status,authorized_by_user_id,authorized_at,legacy_source,metadata,updated_at
    ) values (
      auth_id,oauth.account_id,'shopee','live','BR',shop,'Shopee '||shop::text,
      'active',oauth.user_id,now(),false,jsonb_build_object('source','third_party_oauth_v3'),now()
    )
    on conflict (provider,environment,region,external_shop_id) do update set
      authorization_id=excluded.authorization_id,
      status='active',
      authorized_by_user_id=excluded.authorized_by_user_id,
      authorized_at=excluded.authorized_at,
      legacy_source=false,
      last_error=null,
      metadata=excluded.metadata,
      updated_at=now();
    changed := changed + 1;
  end loop;

  update private.shopee_oauth_states_v3
     set status='completed',completed_at=now(),result_authorization_id=auth_id
   where state_hash=p_state_hash;

  return query select auth_id,changed;
end;
$$;

create or replace function public.get_shopee_authorization_tokens_v3(p_authorization_id uuid)
returns table(
  partner_id bigint,access_token text,refresh_token text,
  access_expires_at timestamptz,refresh_expires_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select authz.partner_id,access_secret.decrypted_secret,
         refresh_secret.decrypted_secret,authz.access_token_expires_at,
         authz.refresh_token_expires_at
  from public.shopee_authorizations authz
  join private.shopee_authorization_tokens token
    on token.authorization_id=authz.id
  join vault.decrypted_secrets access_secret on access_secret.id=token.access_token_secret_id
  join vault.decrypted_secrets refresh_secret on refresh_secret.id=token.refresh_token_secret_id
  where authz.id=p_authorization_id and authz.status='active';
$$;

create or replace function public.rotate_shopee_authorization_tokens_v3(
  p_authorization_id uuid,p_access_token text,p_refresh_token text,
  p_access_expires_at timestamptz,p_refresh_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = ''
as $$
declare token private.shopee_authorization_tokens%rowtype;
begin
  select * into token from private.shopee_authorization_tokens
   where authorization_id=p_authorization_id for update;
  if token.authorization_id is null then raise exception 'Authorization token not found'; end if;
  perform vault.update_secret(token.access_token_secret_id,p_access_token);
  perform vault.update_secret(token.refresh_token_secret_id,p_refresh_token);
  update private.shopee_authorization_tokens
     set token_version=token_version+1,updated_at=now()
   where authorization_id=p_authorization_id;
  update public.shopee_authorizations
     set access_token_expires_at=p_access_expires_at,
         refresh_token_expires_at=p_refresh_expires_at,updated_at=now()
   where id=p_authorization_id;
end;
$$;

create or replace function public.revoke_shopee_connection_v3(p_connection_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare connection public.shopee_connections%rowtype;
token private.shopee_authorization_tokens%rowtype;
begin
  select * into connection from public.shopee_connections where id=p_connection_id for update;
  if connection.id is null then raise exception 'Connection not found'; end if;
  update public.shopee_connections set status='revoked',updated_at=now() where id=connection.id;

  if connection.authorization_id is not null and not exists(
    select 1 from public.shopee_connections other
    where other.authorization_id=connection.authorization_id and other.status='active'
  ) then
    select * into token from private.shopee_authorization_tokens
     where authorization_id=connection.authorization_id;
    if token.authorization_id is not null then
      delete from vault.secrets
       where id in (token.access_token_secret_id,token.refresh_token_secret_id);
    end if;
    delete from private.shopee_authorization_tokens
     where authorization_id=connection.authorization_id;
    update public.shopee_authorizations set status='revoked',updated_at=now()
     where id=connection.authorization_id;
  end if;
end;
$$;

create or replace function public.commit_shopee_ads_manual_v1(
  p_batch_id uuid,p_rows jsonb
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare batch public.shopee_ads_import_batches%rowtype;
changed integer;
begin
  select * into batch from public.shopee_ads_import_batches
   where id=p_batch_id for update;
  if batch.id is null or batch.status<>'processing' then
    raise exception 'Import batch is missing or is not processing';
  end if;
  if batch.period_start is null or batch.period_end is null then
    raise exception 'Import period is required';
  end if;

  if batch.replace_period then
    delete from public.shopee_ads_manual_daily daily
     where daily.account_id=batch.account_id and daily.shop_id=batch.shop_id
       and daily.performance_date between batch.period_start and batch.period_end;
  end if;

  insert into public.shopee_ads_manual_daily(
    batch_id,account_id,connection_id,shop_id,performance_date,campaign_id,
    campaign_name,item_id,model_id,placement_key,source_row_hash,
    impressions,clicks,orders,expense,direct_gmv,broad_gmv,updated_at
  )
  select batch.id,batch.account_id,batch.connection_id,batch.shop_id,row.performance_date,
    coalesce(row.campaign_id,''),row.campaign_name,coalesce(row.item_id,0),
    coalesce(row.model_id,0),coalesce(row.placement_key,''),row.source_row_hash,
    coalesce(row.impressions,0),coalesce(row.clicks,0),coalesce(row.orders,0),
    coalesce(row.expense,0),coalesce(row.direct_gmv,0),coalesce(row.broad_gmv,0),now()
  from jsonb_to_recordset(p_rows) as row(
    performance_date date,campaign_id text,campaign_name text,item_id bigint,
    model_id bigint,placement_key text,source_row_hash text,impressions bigint,
    clicks bigint,orders bigint,expense numeric,direct_gmv numeric,broad_gmv numeric
  )
  on conflict (account_id,shop_id,performance_date,campaign_id,item_id,model_id,placement_key)
  do update set batch_id=excluded.batch_id,connection_id=excluded.connection_id,
    campaign_name=excluded.campaign_name,source_row_hash=excluded.source_row_hash,
    impressions=excluded.impressions,clicks=excluded.clicks,orders=excluded.orders,
    expense=excluded.expense,direct_gmv=excluded.direct_gmv,broad_gmv=excluded.broad_gmv,
    updated_at=now();

  get diagnostics changed=row_count;
  update public.shopee_ads_import_batches
   set status='completed',completed_at=now(),
       validation_summary=jsonb_build_object('committed_rows',changed,'replace_period',batch.replace_period)
   where id=batch.id;
  return changed;
end;
$$;

revoke all on function public.create_shopee_oauth_state_v3(text,uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.claim_shopee_oauth_state_v3(text) from public,anon,authenticated;
revoke all on function public.fail_shopee_oauth_state_v3(text,text) from public,anon,authenticated;
revoke all on function public.finalize_shopee_oauth_v3(text,bigint,text,text,timestamptz,timestamptz,bigint[]) from public,anon,authenticated;
revoke all on function public.get_shopee_authorization_tokens_v3(uuid) from public,anon,authenticated;
revoke all on function public.rotate_shopee_authorization_tokens_v3(uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.revoke_shopee_connection_v3(uuid) from public,anon,authenticated;
revoke all on function public.commit_shopee_ads_manual_v1(uuid,jsonb) from public,anon,authenticated;

grant execute on function public.create_shopee_oauth_state_v3(text,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.claim_shopee_oauth_state_v3(text) to service_role;
grant execute on function public.fail_shopee_oauth_state_v3(text,text) to service_role;
grant execute on function public.finalize_shopee_oauth_v3(text,bigint,text,text,timestamptz,timestamptz,bigint[]) to service_role;
grant execute on function public.get_shopee_authorization_tokens_v3(uuid) to service_role;
grant execute on function public.rotate_shopee_authorization_tokens_v3(uuid,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.revoke_shopee_connection_v3(uuid) to service_role;
grant execute on function public.commit_shopee_ads_manual_v1(uuid,jsonb) to service_role;
