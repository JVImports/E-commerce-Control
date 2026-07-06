-- Prepare Shopee sync tables for multi-shop writes.
-- This migration is intentionally additive: it creates shop-scoped unique indexes
-- while keeping legacy keys in place so the existing cron-backed shopee-sync
-- function does not break during the transition.

DO $$
BEGIN
  IF to_regclass('public.shopee_orders') IS NOT NULL THEN
    UPDATE public.shopee_orders SET shop_id = 1382486082 WHERE shop_id IS NULL;
    ALTER TABLE public.shopee_orders ALTER COLUMN shop_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS shopee_orders_shop_order_uidx
      ON public.shopee_orders (shop_id, order_sn);
  END IF;

  IF to_regclass('public.shopee_escrow') IS NOT NULL THEN
    UPDATE public.shopee_escrow SET shop_id = 1382486082 WHERE shop_id IS NULL;
    ALTER TABLE public.shopee_escrow ALTER COLUMN shop_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS shopee_escrow_shop_order_uidx
      ON public.shopee_escrow (shop_id, order_sn);
  END IF;

  IF to_regclass('public.shopee_order_items') IS NOT NULL THEN
    UPDATE public.shopee_order_items oi
       SET shop_id = o.shop_id
      FROM public.shopee_orders o
     WHERE oi.shop_id IS NULL
       AND oi.order_sn = o.order_sn;
    UPDATE public.shopee_order_items SET shop_id = 1382486082 WHERE shop_id IS NULL;
    ALTER TABLE public.shopee_order_items ALTER COLUMN shop_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS shopee_order_items_shop_line_uidx
      ON public.shopee_order_items (shop_id, line_key);
  END IF;

  IF to_regclass('public.shopee_products') IS NOT NULL THEN
    UPDATE public.shopee_products SET shop_id = 1382486082 WHERE shop_id IS NULL;
    ALTER TABLE public.shopee_products ALTER COLUMN shop_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS shopee_products_shop_item_uidx
      ON public.shopee_products (shop_id, item_id);
  END IF;

  IF to_regclass('public.shopee_variations') IS NOT NULL THEN
    UPDATE public.shopee_variations SET shop_id = 1382486082 WHERE shop_id IS NULL;
    ALTER TABLE public.shopee_variations ALTER COLUMN shop_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS shopee_variations_shop_model_uidx
      ON public.shopee_variations (shop_id, model_id);
  END IF;

  IF to_regclass('public.shopee_ads_product_campaigns') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS shopee_ads_product_campaigns_shop_campaign_uidx
      ON public.shopee_ads_product_campaigns (shop_id, campaign_id);
  END IF;

  IF to_regclass('public.shopee_ads_product_campaign_daily') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS shopee_ads_product_campaign_daily_shop_campaign_date_uidx
      ON public.shopee_ads_product_campaign_daily (shop_id, campaign_id, performance_date);
  END IF;

  IF to_regclass('public.shopee_ads_daily_performance') IS NOT NULL THEN
    UPDATE public.shopee_ads_daily_performance SET shop_id = 1382486082 WHERE shop_id IS NULL;
    ALTER TABLE public.shopee_ads_daily_performance ALTER COLUMN shop_id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS shopee_ads_daily_performance_shop_date_uidx
      ON public.shopee_ads_daily_performance (shop_id, performance_date);
  END IF;
END $$;
