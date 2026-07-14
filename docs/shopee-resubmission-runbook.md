# Shopee third-party resubmission runbook

## Reviewer journey

Use `https://mavis-hub.netlify.app/?review=shopee`. Test the credentials in a private browser immediately before submission. Login must open **Integrações**, showing active Shopee and UPSeller cards, shops/modules, record counts and recent timestamps. The account is read-only and must require no Supabase details, installation or additional login.

## Form guidance

- Product: **Mavis**, operated by JV IMPORTS LTDA, CNPJ 53.642.321/0001-56.
- Select only services visibly demonstrated in the reviewer account.
- Remove TikTok. Describe UPSeller as controlled XLSX/CSV ETL, never as an API integration.
- Do not request unmasked PII or claim a penetration-test report that does not exist.
- Suggested remarks: “Mavis is a live multi-tenant hub for marketplace sellers, operated by JV IMPORTS LTDA. Sign in with the test credentials, open ‘Integrações’, and verify the active Shopee and UPSeller integrations, their stores, modules, last synchronization and imported records. The test account is read-only and requires no installation or additional login. UPSeller is integrated through a controlled XLSX/CSV ETL workflow. We do not request access to unmasked PII.”

## Evidence checklist

- Current one-page official CNPJ proof.
- Login, Integrações and module screenshots with PII masked.
- Short video: login → Integrações → modules; never display password or PII.
- Shopee sync under 24 hours and completed UPSeller import.
- Production URL, HTTPS and reviewer credentials verified immediately before submission.

Keep evidence outside Git. Rotate the previously exposed reviewer password and revoke old sessions. Only the account owner enters the password and performs the final Shopee submission.
