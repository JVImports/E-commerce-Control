-- Gate 1: close anonymous commercial-data access and remove global
-- authenticated reads before onboarding any third-party Shopee tenant.
--
-- This migration is intentionally additive/non-destructive: it does not
-- delete business data or legacy credentials. Token migration and rotation
-- happen only after the OAuth v3 canary is proven.

begin;

-- Fail closed for every current and future base table in the exposed schema.
do $$
declare
  target record;
begin
  for target in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', target.table_name);
  end loop;
end
$$;

-- Remove policies that give an entire client role unrestricted visibility.
-- Owner- and membership-scoped policies remain in place.
do $$
declare
  target record;
begin
  for target in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') = 'true'
      and roles && array['public', 'anon', 'authenticated']::name[]
  loop
    execute format('drop policy if exists %I on public.%I', target.policyname, target.tablename);
  end loop;
end
$$;

-- A global fee default may be read by signed-in users, but it must never be
-- inserted, changed or deleted through the public/default row.
drop policy if exists commerce_fee_settings_owner_all
  on public.commerce_fee_settings;
drop policy if exists commerce_fee_settings_authenticated_select_v4
  on public.commerce_fee_settings;
drop policy if exists commerce_fee_settings_owner_insert_v4
  on public.commerce_fee_settings;
drop policy if exists commerce_fee_settings_owner_update_v4
  on public.commerce_fee_settings;
drop policy if exists commerce_fee_settings_owner_delete_v4
  on public.commerce_fee_settings;

create policy commerce_fee_settings_authenticated_select_v4
  on public.commerce_fee_settings
  for select
  to authenticated
  using (
    user_id is null
    or user_id = (select auth.uid())
  );

create policy commerce_fee_settings_owner_insert_v4
  on public.commerce_fee_settings
  for insert
  to authenticated
  with check (
    user_id is not null
    and user_id = (select auth.uid())
  );

create policy commerce_fee_settings_owner_update_v4
  on public.commerce_fee_settings
  for update
  to authenticated
  using (
    user_id is not null
    and user_id = (select auth.uid())
  )
  with check (
    user_id is not null
    and user_id = (select auth.uid())
  );

create policy commerce_fee_settings_owner_delete_v4
  on public.commerce_fee_settings
  for delete
  to authenticated
  using (
    user_id is not null
    and user_id = (select auth.uid())
  );

-- Account membership is the canonical read boundary for tables that already
-- carry account_id. Legacy owner policies remain as a temporary fallback for
-- rows awaiting a controlled account_id backfill.
do $$
declare
  target record;
  policy_name text;
begin
  for target in
    select distinct columns.table_name
    from information_schema.columns columns
    join information_schema.tables tables
      on tables.table_schema = columns.table_schema
     and tables.table_name = columns.table_name
    where columns.table_schema = 'public'
      and columns.column_name = 'account_id'
      and tables.table_type = 'BASE TABLE'
      and columns.table_name not in ('accounts', 'account_members')
  loop
    policy_name := target.table_name || '_account_member_select_v4';
    execute format('drop policy if exists %I on public.%I', policy_name, target.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (' ||
      '%I.account_id is not null and exists (' ||
      'select 1 from public.account_members member ' ||
      'where member.account_id = %I.account_id ' ||
      'and member.user_id = (select auth.uid())' ||
      '))',
      policy_name,
      target.table_name,
      target.table_name,
      target.table_name
    );
  end loop;
end
$$;

-- Core Shopee facts still keyed only by shop_id inherit the account boundary
-- through shopee_shops until their account_id/connection_id backfill lands.
do $$
declare
  target record;
  policy_name text;
begin
  for target in
    select distinct shop_columns.table_name
    from information_schema.columns shop_columns
    join information_schema.tables tables
      on tables.table_schema = shop_columns.table_schema
     and tables.table_name = shop_columns.table_name
    where shop_columns.table_schema = 'public'
      and shop_columns.column_name = 'shop_id'
      and tables.table_type = 'BASE TABLE'
      and shop_columns.table_name <> 'shopee_shops'
      and not exists (
        select 1
        from information_schema.columns account_columns
        where account_columns.table_schema = shop_columns.table_schema
          and account_columns.table_name = shop_columns.table_name
          and account_columns.column_name = 'account_id'
      )
  loop
    policy_name := target.table_name || '_shop_member_select_v4';
    execute format('drop policy if exists %I on public.%I', policy_name, target.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (' ||
      'exists (' ||
      'select 1 from public.shopee_shops shop ' ||
      'join public.account_members member on member.account_id = shop.account_id ' ||
      'where shop.shop_id = %I.shop_id ' ||
      'and member.user_id = (select auth.uid())' ||
      '))',
      policy_name,
      target.table_name,
      target.table_name
    );
  end loop;
end
$$;

-- The legacy table remains available to backend functions during the canary,
-- but browsers receive only a token-free representation.
create or replace view public.shopee_shops_safe
with (security_invoker = true)
as
select
  id,
  user_id,
  shop_id,
  shop_name,
  token_expire_in,
  created_at,
  updated_at,
  account_id,
  app_id,
  connection_status,
  auth_expires_at,
  region
from public.shopee_shops;

-- Existing views must obey the caller's RLS policies.
do $$
declare
  target record;
begin
  for target in
    select c.relname as view_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = true)', target.view_name);
  end loop;
end
$$;

-- Anonymous clients do not need direct Data API access. Authentication itself
-- continues through the managed Auth API, not through public tables/functions.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Remove privileges that RLS cannot safely scope and close secret-bearing
-- legacy objects to browser roles.
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke all privileges on table public.shopee_app_secrets from authenticated;
revoke all privileges on table public.shopee_oauth_states from authenticated;
revoke all privileges on table public.shopee_oauth_start_tokens from authenticated;
revoke all privileges on table public.shopee_shops from authenticated;

grant select (
  id,
  user_id,
  shop_id,
  shop_name,
  token_expire_in,
  created_at,
  updated_at,
  account_id,
  app_id,
  connection_status,
  auth_expires_at,
  region
) on table public.shopee_shops to authenticated;
grant select on table public.shopee_shops_safe to authenticated;

-- Migrations created by postgres become opt-in for Data API roles. Keep the
-- platform service role explicit; it is used only by trusted Edge Functions.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Supabase-managed defaults may exist on older projects. Harden them when the
-- migration role is allowed to alter supabase_admin defaults; otherwise the
-- explicit object grants and postgres defaults above remain authoritative.
do $$
begin
  begin
    execute 'alter default privileges for role supabase_admin in schema public revoke all privileges on tables from anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke all privileges on sequences from anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon, authenticated';
  exception
    when insufficient_privilege then
      raise notice 'Skipping supabase_admin default privileges: insufficient privilege';
  end;
end
$$;

-- Migration-level assertions: abort rather than publish a partially closed
-- security gate.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') = 'true'
      and roles && array['public', 'anon', 'authenticated']::name[]
  ) then
    raise exception 'Unrestricted public/anon/authenticated SELECT policy remains';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'
  ) then
    raise exception 'Anonymous table privileges remain in public schema';
  end if;

  if has_column_privilege('authenticated', 'public.shopee_shops', 'access_token', 'select')
     or has_column_privilege('authenticated', 'public.shopee_shops', 'refresh_token', 'select') then
    raise exception 'Authenticated browser role can still select legacy Shopee tokens';
  end if;
end
$$;

commit;
