# Shopee third-party transition

Status: development scaffold. The legacy in-house integration remains the rollback path.

## What is ready in code

- Canonical tenant-owned Shopee authorizations and connections.
- One authorization may own multiple shops without duplicating refresh tokens.
- OAuth state is random, hashed, short-lived and atomically claimed.
- OAuth callback runs server-side and does not depend on a browser session.
- Access and refresh tokens are encrypted with Supabase Vault.
- Partner ID/Key are read only from Edge Function secrets.
- Legacy shop rows are backfilled as `legacy_pending_reauth` metadata without copying their tokens.
- Manual Ads import is isolated from API-derived Ads and replaces a complete period transactionally.
- New browser UI never asks a customer for Partner ID or Partner Key.

## Required Edge secrets after Shopee approves the app

- `SHOPEE_THIRD_PARTY_PARTNER_ID`
- `SHOPEE_THIRD_PARTY_PARTNER_KEY`
- `SHOPEE_THIRD_PARTY_REDIRECT_URI`
- `APP_RETURN_URL`
- Optional: `APP_ALLOWED_RETURN_ORIGINS`

Stable callback to register in Shopee:

`https://qzcxukcwvjnhbnwpjceg.supabase.co/functions/v1/shopee-oauth-callback-v3`

Do not commit any real secret.

## Deliberately not applied/deployed yet

- Migration `20260710193000_third_party_oauth_v3.sql`.
- Edge Functions `shopee-oauth-v3`, `shopee-oauth-callback-v3` and `shopee-ads-import-v1`.
- Unified Ads reporting views.
- `shopee-sync-v3` account/authorization worker.
- Destructive cleanup of legacy public tokens, secrets, states, triggers and v2 functions.

## Known review findings before deployment

- Reauthorizing an already connected shop must revoke the superseded authorization and delete its Vault secrets so stale grants do not remain orphaned.
- The Ads importer must reject or aggregate duplicate natural keys within one file before executing the transactional upsert.
- Confirm that SheetJS (`window.XLSX`) is loaded by the application before enabling XLSX imports; CSV does not depend on it.
- The new connection panel replaces the legacy panel. If UI-accessible rollback is required, add an explicit legacy fallback instead of relying only on the retained v2 backend.
- Run a database preflight for role values, duplicate external shop ownership and legacy backfill conflicts before applying the migration.
- Expand the CI secret scan beyond assignment-style patterns before treating it as the sole credential gate.

## Before external customers

1. Apply the additive migration after reviewing its preflight.
2. Deploy the three new functions with the JWT settings in `supabase/config.toml`.
3. Obtain an anonymized Shopee Brazil Ads export and freeze the parser mapping.
4. Convert the Ads reporting views to `security_invoker` and define manual-over-API precedence by shop/date.
5. Remove anonymous and unrestricted authenticated policies from commercial data.
6. Implement `shopee-sync-v3` using `account_id + connection_id`, never `user_id`.
7. Mock-test OAuth success, replay, expiry, cross-tenant conflict and multi-shop token grants.
8. After approval, authorize one internal shop, compare data, then authorize the second.
9. Keep in-house apps available until both shops pass the v3 acceptance suite.
