# Mavis release and rollback runbook

## Release gates

1. Confirm the release PR preview uses the staging Supabase variables and is `READY` for the PR head SHA.
2. Run the GitHub `Release candidate checks` workflow. Do not override failures in syntax, secrets, RLS/E2E, banned copy, or assets.
3. In a clean private browser, open `/?review=shopee`, sign in with the reviewer account, and confirm it lands on **Integrações** without setup prompts.
4. Verify the reviewer can read every intended module, cannot see mutation controls, and receives HTTP 403 when a mutation endpoint is called directly.
5. Confirm Shopee has an active shop and a successful sync less than 24 hours old; confirm the latest UPSeller ETL completed successfully.
6. Merge to `main`, then verify the Netlify production deploy commit equals the merge SHA. Smoke-test HTTPS, auth restore/expiry, Integrações, module navigation, 401/403/404/5xx states, desktop and mobile.
7. Monitor Auth, API and Edge Function failures for 24 hours before submitting to Shopee.

Netlify must define `MAVIS_SUPABASE_URL` and `MAVIS_SUPABASE_PUBLISHABLE_KEY` separately for deploy previews and production. `CONTEXT` is supplied by Netlify. Neither variable may be a service-role secret.

## Rollback

1. Disable the v3 feature flag if OAuth/sync v3 is implicated; keep v2 jobs available.
2. Restore the last known-good Netlify deploy and verify its commit and health checks.
3. Revert the release merge in GitHub through a new PR. Do not force-push or reset `main`.
4. Roll database changes back only with reviewed compensating migrations. Never restore anonymous grants or delete Vault tokens during diagnosis.
5. Record correlation IDs, affected tenants, timestamps and recovery evidence before closing the incident.

## Required evidence record

Record the release PR, merge SHA, preview URL/SHA, production deploy URL/SHA, workflow run, smoke-test timestamp, reviewer test result and monitoring owner. Store no passwords, tokens, customer PII, database dumps, PDFs or videos in Git.
