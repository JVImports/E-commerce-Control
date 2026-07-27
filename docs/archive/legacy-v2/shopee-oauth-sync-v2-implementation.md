# Shopee OAuth Sync V2 Rollout

Atualizado em 2026-07-03.

## Objetivo

Preparar a base da JV Imports Control Tower para operar mais de uma loja Shopee usando apps separados do Shopee Open Platform, sem gravar `partner_key`, `access_token`, `refresh_token` ou service role no front-end, no localStorage ou no GitHub.

## Estado atual no Supabase

Projeto Supabase: `qzcxukcwvjnhbnwpjceg`

Funções ativas relevantes:

- `shopee-sync` v52: fluxo legado preservado.
- `shopee-sync-product-ads` v3: corrigida para buscar `shopee_app_secrets` no schema `public` com RLS/grants fechados e acesso via `service_role` somente no backend.
- `shopee-sync-v2` v1: nova função multi-app, isolada do legado, com `verify_jwt=true`.
- `shopee-auth-start` v2: inicia OAuth via token temporário.
- `shopee-auth-callback` v2: recebe callback OAuth e salva loja/tokens.

Loja OAuth conectada:

- `shop_id`: `281501809`
- `connection_status`: `oauth_connected`
- `credential_source`: app Shopee salvo em `shopee_apps` + chave em `shopee_app_secrets`

Loja legada/manual preservada:

- `shop_id`: `1382486082`
- `connection_status`: `manual`
- `credential_source`: variáveis de ambiente antigas

## Segurança aplicada

As tabelas abaixo ficam em `public` por compatibilidade com Supabase JS/PostgREST dentro das Edge Functions, mas sem grants para `anon` ou `authenticated`:

- `public.shopee_app_secrets`
- `public.shopee_oauth_states`
- `public.shopee_oauth_start_tokens`

Acesso permitido apenas a `postgres` e `service_role`. As Edge Functions usam `SUPABASE_SERVICE_ROLE_KEY` somente no runtime do Supabase.

## Como invocar a v2

Endpoint:

```http
POST https://qzcxukcwvjnhbnwpjceg.supabase.co/functions/v1/shopee-sync-v2
Authorization: Bearer <supabase_user_jwt>
Content-Type: application/json
```

Exemplo:

```json
{
  "action": "status",
  "shop_id": 281501809
}
```

Ações seguras implementadas na `shopee-sync-v2`:

- `status`
- `refresh-token`
- `sync-products`
- `sync-variations`
- `sync-catalog`
- `sync-product-ads`

Ações bloqueadas de propósito na v2 até migração de schema:

- `sync-ads-daily-step`
- `sync-ads-balance`
- `sync-financial`
- `sync-orders-step`
- `sync-orders`
- `sync-escrow-step`
- `sync-wallet-step`
- `sync-returns-step`
- `sync-income-overview`

Motivo: parte das tabelas legadas ainda possui chave primária sem `shop_id`, o que pode sobrescrever dados entre lojas.

## Bloqueios de schema para multi-loja completo

Tabelas que ainda precisam revisão antes de virar fonte multi-tenant definitiva:

- `shopee_ads_daily_performance`: PK atual em `performance_date`; deve virar chave composta por loja/período.
- `shopee_ads_balance`: PK atual em `data_timestamp`; deve virar chave composta com `shop_id`.
- `shopee_products`: PK atual em `item_id`; provável ID global da Shopee, mas recomenda-se avaliar chave composta ou chave surrogate para multi-marketplace.
- `shopee_variations`: PK atual em `model_id`; mesma observação de `item_id`.
- Tabelas financeiras e pedidos devem ser auditadas antes de receber dados de múltiplas lojas.

## Próximos passos recomendados

1. Ligar o front ao Supabase Auth real, porque `shopee-sync-v2` exige JWT de usuário e não deve aceitar chamadas anônimas.
2. Adicionar no painel uma seleção de loja ativa por `shop_id`.
3. Chamar `shopee-sync-v2` para `status`, `refresh-token`, `sync-catalog` e `sync-product-ads` da loja OAuth.
4. Migrar as tabelas legadas para chaves compostas por `shop_id` antes de ativar financeiro/ads diário na v2.
5. Depois da validação, substituir gradualmente chamadas antigas de `shopee-sync` por `shopee-sync-v2`.

## Observação sobre Netlify

Tudo foi feito em Supabase e documentado na branch `codex/product-ads-layout-fixes`. Não houve merge para `main` e não foi acionado deploy de produção.
