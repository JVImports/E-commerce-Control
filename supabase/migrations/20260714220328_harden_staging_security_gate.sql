-- Close security advisor blockers inherited from the production baseline.

alter view public.shopee_ads_daily set (security_invoker = true);
alter view public.vw_product_ads_daily set (security_invoker = true);
alter view public.vw_product_ads_summary set (security_invoker = true);
alter view public.vw_product_variation_performance_summary set (security_invoker = true);
alter view public.vw_product_performance_summary set (security_invoker = true);

alter function public.check_user_shop_limit()
  set search_path = public, pg_temp;

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

drop policy if exists "Permitir escrita anonima sync_state"
  on public.sync_state;
drop policy if exists "Permitir insercao anonima upseller_stock_imports"
  on public.upseller_stock_imports;
drop policy if exists "p_upseller_stock_settings_insert_authenticated"
  on public.upseller_stock_settings;
drop policy if exists "p_upseller_stock_settings_update_authenticated"
  on public.upseller_stock_settings;
drop policy if exists "Permitir insercao anonima upseller_stock_snapshot"
  on public.upseller_stock_snapshot;
