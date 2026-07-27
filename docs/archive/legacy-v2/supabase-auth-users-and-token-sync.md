# Supabase Auth users and Shopee token sync bridge

Status: applied to Supabase project `qzcxukcwvjnhbnwpjceg` on 2026-07-03.

## What was applied

- Created/confirmed two real Supabase Auth users for the existing app login emails:
  - `admin@jvimports.com.br` with account role `admin`
  - `cliente@jvimports.com.br` with account role `client`
- Associated both users with the existing JV Imports account through `public.account_members`.
- Mirrored the active live Shopee app row for both users so the current deployed Edge Functions can continue to resolve resources by `user_id`.
- Mirrored the existing Shopee shop rows for both users so `shopee-auth`, `shopee-sync-v2`, and `shopee-sync-product-ads` can operate with their JWTs before the deeper account-based function refactor.
- Added backend-only triggers to keep duplicated Shopee credentials synchronized by account/shop/app:
  - `public.sync_shopee_shop_tokens_by_account()` keeps `access_token`, `refresh_token`, and expiry columns aligned across rows with the same `account_id` and `shop_id`.
  - `public.sync_shopee_app_secret_by_account()` keeps mirrored Partner Keys aligned across rows with the same `account_id`, `partner_id`, and `environment`.
- Added `public.app_public_health` as a minimal anonymous-readable health view for future frontend credential checks after Shopee/product tables are locked down.

## Validation performed

- Both Auth users are confirmed.
- Both stored password hashes validate against the intended credentials already present in the app login screen.
- Both users are members of account `9bad1807-8910-4166-ab1e-d552a6a41470`.
- Both users see 2 mirrored Shopee shop rows, including 1 OAuth-connected shop.
- Both users have the live Shopee app row and a backend Partner Key record.
- The health view returns `status = ok`.

## Why this bridge exists

The current deployed Edge Functions were originally written around `user_id`, not account membership. A full multi-user/multi-account model should query shops and apps through `account_members`. Until those Edge Functions are refactored and deployed, this bridge lets real Supabase Auth logins operate safely without copying secrets to the browser or GitHub.

The token sync trigger is important because Shopee refresh tokens can rotate. If one mirrored row refreshes the token, sibling rows for the same account/shop are updated immediately.

## Next hardening step

After the frontend Auth branch is merged/deployed, apply the RLS hardening draft in:

- `docs/sql/20260703_auth_rls_hardening_draft.sql`

Do not apply that draft while production still depends on anonymous/demo reads, because it intentionally removes broad anon access from Shopee/product/log tables.
