# Release readiness — development branch

Status: **release candidate, not yet approved for production**.

## Completed in this branch

- Removed demo credentials and the local/demo authentication fallback.
- Pinned browser dependencies and added an allowlisted Netlify build directory.
- Added CI checks for JavaScript syntax, publish contents and known secret patterns.
- Fixed late-loaded Shopee OAuth callback processing.
- Added a confirmation before unlinking a shop.
- Scoped product, variation, sales, Ads, finance settings and manual Ads overrides by `shop_id`.
- Removed the fictitious one-unit profit calculation when there are no sales.
- Added `shopee-auth-v2` and hardened `shopee-sync-v2` with exact Shopee origins, timeouts, JWT status codes and owner/admin mutation checks.
- Added and applied a fail-closed multi-shop migration: it aborts if any row lacks `shop_id`.
- Verified 9 `shop_id NOT NULL` columns and 9 shop-scoped unique indexes.
- Deployed `shopee-auth-v2` v1 and `shopee-sync-v2` v2 with JWT verification enabled.

## Required before production

1. Rotate both previously published demo-account passwords in Supabase Auth and revoke their sessions. Never place the new passwords in GitHub or chat.
2. Validate login, OAuth, status and one controlled Ads sync in the Netlify deploy preview.
3. Review and replace the broad anonymous/RLS policies and convert the five reporting views to security invoker in a separately tested security migration.
4. Merge only after the release-candidate workflow and Netlify preview are green.
