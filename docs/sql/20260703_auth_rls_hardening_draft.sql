-- Draft RLS/security hardening for the Supabase Auth multi-account rollout.
--
-- IMPORTANT: do not apply this while the application still relies on the
-- hardcoded demo logins to read production data through the anon key.
-- Apply after admin/client are real Supabase Auth users and account/shop
-- membership is mapped.
--
-- Goals:
-- - Remove anonymous reads from Shopee product/ads/log data.
-- - Restrict direct browser reads to rows owned by the signed-in user.
-- - Keep Partner Keys/tokens reachable only by service_role-backed Edge Functions.
-- - Convert reporting views to security_invoker so RLS still applies.

begin;

-- 1) Keep Shopee secrets and OAuth transient tables backend-only.
revoke all on table public.shopee_app_secrets from anon, authenticated;
revoke all on table public.shopee_oauth_states from anon, authenticated;
revoke all on table public.shopee_oauth_start_tokens from anon, authenticated;

-- Legacy private copies, if still present, should also remain backend-only.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'private' and table_name = 'shopee_app_secrets') then
    execute 'revoke all on table private.shopee_app_secrets from anon, authenticated';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'private' and table_name = 'shopee_oauth_states') then
    execute 'revoke all on table private.shopee_oauth_states from anon, authenticated';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'private' and table_name = 'shopee_oauth_start_tokens') then
    execute 'revoke all on table private.shopee_oauth_start_tokens from anon, authenticated';
  end if;
end $$;

-- 2) Shopee apps/shops: direct browser access is read-only and scoped by user.
revoke all on table public.shopee_apps from anon;
revoke all on table public.shopee_shops from anon;
revoke insert, update, delete, truncate, references, trigger on table public.shopee_apps from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.shopee_shops from authenticated;
grant select on table public.shopee_apps to authenticated;
grant select on table public.shopee_shops to authenticated;

-- Replace broad/public policies with explicit authenticated owner policies.
drop policy if exists "shopee_apps_owner_select" on public.shopee_apps;
drop policy if exists "shopee_apps_owner_insert" on public.shopee_apps;
drop policy if exists "shopee_apps_owner_update" on public.shopee_apps;
drop policy if exists "shopee_apps_owner_delete" on public.shopee_apps;
create policy shopee_apps_owner_select on public.shopee_apps
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Edge Functions write shopee_apps through service_role. Keep browser writes disabled.

drop policy if exists "Permitir tudo aos donos das lojas" on public.shopee_shops;
create policy shopee_shops_owner_select on public.shopee_shops
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Edge Functions write shopee_shops through service_role. Keep browser writes disabled.

-- 3) Product catalog and product-ads data: signed-in owner reads only.
revoke all on table public.shopee_products from anon;
revoke all on table public.shopee_variations from anon;
revoke all on table public.shopee_ads_product_campaigns from anon;
revoke all on table public.shopee_ads_product_campaign_daily from anon;
revoke insert, update, delete, truncate, references, trigger on table public.shopee_products from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.shopee_variations from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.shopee_ads_product_campaigns from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.shopee_ads_product_campaign_daily from authenticated;
grant select on table public.shopee_products to authenticated;
grant select on table public.shopee_variations to authenticated;
grant select on table public.shopee_ads_product_campaigns to authenticated;
grant select on table public.shopee_ads_product_campaign_daily to authenticated;

drop policy if exists "Permitir leitura anonima shopee_products" on public.shopee_products;
drop policy if exists "p_products_select_authenticated" on public.shopee_products;
drop policy if exists "Policy_User_Access_shopee_products" on public.shopee_products;
create policy shopee_products_owner_select on public.shopee_products
  for select to authenticated
  using (exists (
    select 1
    from public.shopee_shops s
    where s.shop_id = shopee_products.shop_id
      and s.user_id = (select auth.uid())
  ));

drop policy if exists "Permitir leitura anonima shopee_variations" on public.shopee_variations;
drop policy if exists "p_variations_select_authenticated" on public.shopee_variations;
drop policy if exists "Policy_User_Access_shopee_variations" on public.shopee_variations;
create policy shopee_variations_owner_select on public.shopee_variations
  for select to authenticated
  using (exists (
    select 1
    from public.shopee_shops s
    where s.shop_id = shopee_variations.shop_id
      and s.user_id = (select auth.uid())
  ));

drop policy if exists "ads_product_campaigns_owner_select" on public.shopee_ads_product_campaigns;
create policy shopee_ads_product_campaigns_owner_select on public.shopee_ads_product_campaigns
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.shopee_shops s
      where s.shop_id = shopee_ads_product_campaigns.shop_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "ads_product_campaign_daily_owner_select" on public.shopee_ads_product_campaign_daily;
create policy shopee_ads_product_campaign_daily_owner_select on public.shopee_ads_product_campaign_daily
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.shopee_shops s
      where s.shop_id = shopee_ads_product_campaign_daily.shop_id
        and s.user_id = (select auth.uid())
    )
  );

-- 4) Sync logs: no anonymous read; signed-in owner reads only.
revoke all on table public.sync_log from anon;
revoke insert, update, delete, truncate, references, trigger on table public.sync_log from authenticated;
grant select on table public.sync_log to authenticated;

drop policy if exists "Permitir leitura anonima sync_log" on public.sync_log;
drop policy if exists "p_sync_log_select_authenticated" on public.sync_log;
drop policy if exists "Policy_User_Access_sync_log" on public.sync_log;
drop policy if exists "p_sync_log_service_only" on public.sync_log;
create policy sync_log_owner_select on public.sync_log
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_log_service_all on public.sync_log
  for all to service_role
  using (true)
  with check (true);

-- 5) Reporting views should honor invoker RLS instead of creator privileges.
do $$
declare
  view_name text;
begin
  foreach view_name in array array[
    'shopee_ads_daily',
    'vw_product_variation_performance_summary',
    'vw_product_performance_summary',
    'vw_product_ads_daily',
    'vw_product_ads_summary'
  ]
  loop
    if exists (
      select 1
      from information_schema.views
      where table_schema = 'public'
        and table_name = view_name
    ) then
      execute format('alter view public.%I set (security_invoker = true)', view_name);
    end if;
  end loop;
end $$;

-- 6) SECURITY DEFINER helper must not be callable from the public API.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- 7) Indexes required by OAuth/state lookup and owner-scoped RLS checks.
create index if not exists idx_shopee_apps_user_id on public.shopee_apps(user_id);
create index if not exists idx_shopee_shops_user_id on public.shopee_shops(user_id);
create index if not exists idx_shopee_shops_shop_user on public.shopee_shops(shop_id, user_id);
create index if not exists idx_shopee_oauth_states_app_id on public.shopee_oauth_states(app_id);
create index if not exists idx_shopee_oauth_start_tokens_app_id on public.shopee_oauth_start_tokens(app_id);
create index if not exists idx_shopee_ads_product_campaigns_shop_user on public.shopee_ads_product_campaigns(shop_id, user_id);
create index if not exists idx_shopee_ads_product_campaign_daily_shop_user on public.shopee_ads_product_campaign_daily(shop_id, user_id);
create index if not exists idx_sync_log_user_created_at on public.sync_log(user_id, created_at desc);

-- Optional duplicate index cleanup after confirming both names exist in this project:
-- drop index if exists public.idx_shopee_shops_user_shop;

commit;
