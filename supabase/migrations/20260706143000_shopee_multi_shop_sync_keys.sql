-- Prepare Shopee sync tables for multi-shop writes.
-- This migration refuses to guess ownership: any orphan shop_id aborts the
-- transaction and must be corrected explicitly before publication.

DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM public.shopee_orders WHERE shop_id IS NULL) +
    (SELECT count(*) FROM public.shopee_order_items WHERE shop_id IS NULL) +
    (SELECT count(*) FROM public.shopee_escrow WHERE shop_id IS NULL) +
    (SELECT count(*) FROM public.shopee_products WHERE shop_id IS NULL) +
    (SELECT count(*) FROM public.shopee_variations WHERE shop_id IS NULL) +
    (SELECT count(*) FROM public.shopee_ads_product_campaigns WHERE shop_id IS NULL) +
    (SELECT count(*) FROM public.shopee_ads_product_campaign_daily WHERE shop_id IS NULL) +
    (SELECT count(*) FROM public.shopee_ads_daily_performance WHERE shop_id IS NULL) +
    (SELECT count(*) FROM public.shopee_income_overview_snapshots WHERE shop_id IS NULL)
  INTO orphan_count;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Found % Shopee rows without shop_id; refusing to infer ownership', orphan_count;
  END IF;
END
$$;

ALTER TABLE public.shopee_orders ALTER COLUMN shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopee_orders_shop_order_uidx
  ON public.shopee_orders (shop_id, order_sn);

ALTER TABLE public.shopee_order_items ALTER COLUMN shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopee_order_items_shop_line_uidx
  ON public.shopee_order_items (shop_id, line_key);

ALTER TABLE public.shopee_escrow ALTER COLUMN shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopee_escrow_shop_order_uidx
  ON public.shopee_escrow (shop_id, order_sn);

ALTER TABLE public.shopee_products ALTER COLUMN shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopee_products_shop_item_uidx
  ON public.shopee_products (shop_id, item_id);

ALTER TABLE public.shopee_variations ALTER COLUMN shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopee_variations_shop_model_uidx
  ON public.shopee_variations (shop_id, model_id);

ALTER TABLE public.shopee_ads_product_campaigns ALTER COLUMN shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopee_ads_product_campaigns_shop_campaign_uidx
  ON public.shopee_ads_product_campaigns (shop_id, campaign_id);

ALTER TABLE public.shopee_ads_product_campaign_daily ALTER COLUMN shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopee_ads_product_campaign_daily_shop_campaign_date_uidx
  ON public.shopee_ads_product_campaign_daily (shop_id, campaign_id, performance_date);

ALTER TABLE public.shopee_ads_daily_performance ALTER COLUMN shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopee_ads_daily_performance_shop_date_uidx
  ON public.shopee_ads_daily_performance (shop_id, performance_date);

ALTER TABLE public.shopee_income_overview_snapshots ALTER COLUMN shop_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shopee_income_overview_snapshots_shop_snapshot_uidx
  ON public.shopee_income_overview_snapshots (shop_id, snapshot_at);
