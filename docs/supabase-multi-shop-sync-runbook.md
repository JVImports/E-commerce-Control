# Runbook: Shopee multi-shop orders and financial sync

This runbook documents the safe rollout order for enabling orders/financial sync for additional Shopee stores.

## Scope

Target store initially diagnosed as connected but not populated:

- `281501809` - OAuth-connected store with no local orders/financial rows before this rollout.

Current populated legacy/manual store:

- `1382486082` - existing orders, escrow, products, variations and ads data.

## Rollout order

1. Apply database migration:

   `supabase/migrations/20260706143000_shopee_multi_shop_sync_keys.sql`

   The migration is additive. It creates shop-scoped unique indexes while keeping legacy primary keys/unique constraints in place so the current legacy cron does not break during transition.

2. Deploy Edge Function:

   `supabase/functions/shopee-sync-v2/index.ts`

   Deploy as function name `shopee-sync-v2` with JWT verification enabled.

3. Validate v2 status for the authenticated account.

   Expected supported actions include:

   - `refresh-token`
   - `sync-products`
   - `sync-variations`
   - `sync-catalog`
   - `sync-product-ads`
   - `sync-orders-step`
   - `sync-orders-batch`
   - `sync-escrow-step`
   - `sync-income-overview`
   - `sync-financial`

4. Refresh token for store `281501809`.

5. Run a small sync first:

   - `sync-catalog` for `281501809`
   - `sync-orders-step` for `281501809`
   - `sync-escrow-step` for `281501809`

6. Validate row counts by `shop_id`:

   ```sql
   select shop_id, count(*) as orders_count
   from public.shopee_orders
   group by shop_id
   order by shop_id;

   select shop_id, count(*) as escrow_count
   from public.shopee_escrow
   group by shop_id
   order by shop_id;

   select shop_id, count(*) as products_count
   from public.shopee_products
   group by shop_id
   order by shop_id;
   ```

7. If the first month succeeds, continue backfill using `sync-orders-batch` with `months` between 1 and 6 until the historical cursor reaches the current month.

## Important notes

- Do not expose `service_role`, Shopee Partner Key, access tokens or refresh tokens in GitHub or browser code.
- Keep the legacy `shopee-sync` cron untouched until `shopee-sync-v2` proves stable for orders and escrow.
- The front filter was not the root cause of the missing sales. Before rollout, `shopee_orders` had rows only for `shop_id = 1382486082`; `281501809` had no local rows.
- The two stores currently share the display name `Loja Principal`, so the UI should continue showing the Shop ID next to the name.
