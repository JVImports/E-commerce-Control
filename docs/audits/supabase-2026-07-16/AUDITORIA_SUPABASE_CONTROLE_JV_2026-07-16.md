# Auditoria profunda do Supabase — Controle JV

**Data de corte:** 2026-07-16 (America/São_Paulo)
**Produção auditada:** Central de Bases Shopee — `qzcxukcwvjnhbnwpjceg`
**Comparativo:** Mavis Staging — `zgfehhqfodhspklbwhgc`
**Escopo de mudança:** somente este relatório; nenhuma API, tabela, policy, função, secret, cron ou deploy foi alterado.

> Classificação: severidade `Crítica`, `Alta`, `Média` ou `Baixa`; confiança `Confirmado`, `Inferido` ou `Não verificável`. “Confirmado” significa evidência direta no catálogo/código/deploy/log; não significa que impacto jurídico ou comercial tenha sido mensurado.

## 1. Resumo executivo

- **Crítica · Confirmado — exposição anônima real:** 23 tabelas têm policy `anon SELECT USING (true)`. Uma requisição `HEAD`, usando somente a chave publicável do site e sem baixar linhas, recebeu `206` e `content-range 0-999/7202` em `shopee_orders`. Essa tabela contém `buyer_username` e `shipping_address`; o mesmo padrão alcança itens, escrow, carteira, Ads, UPSeller e logs.
- **Crítica · Confirmado — isolamento autenticado quebrado:** 18 tabelas têm `authenticated SELECT USING (true)`. Qualquer usuário autenticado pode ler todas as linhas desses objetos, independentemente de conta/loja. Além disso, `commerce_fee_settings_owner_all` aceita `user_id IS NULL` para `PUBLIC` em `ALL`, permitindo mutação anônima do registro global porque `anon` possui DML.
- **Alta · Confirmado — credenciais legadas em claro:** `public.shopee_shops` mantém seis access tokens e seis refresh tokens não nulos e é consultável pelos respectivos donos via browser; `public.shopee_app_secrets` e `private.shopee_app_secrets` guardam chaves de parceiro em texto. O desenho v3 com referências ao Vault existe, mas tem zero autorizações/tokens e suas Edge Functions não estão em produção.
- **Alta · Confirmado — produção não é reproduzível a partir de GitHub:** o deploy Netlify vigente é manual (`commit_ref = null`), o `main` remoto termina em `1b583ba` e não contém `supabase/`, `runtime-config.js` nem os clientes de Auth; o checkout/config aponta para produção, mas quatro funções locais estão apenas em staging e cinco funções legadas de produção não têm fonte local.
- **Alta · Confirmado — frontend publicado chama backend ausente:** `shopee-ads-import.js` chama `shopee-ads-import-v1`, implantada somente em staging. O importador manual de Ads publicado não possui função homônima em produção.
- **Operação saudável, mas cara:** os oito crons tiveram zero falhas de enfileiramento em 24 h, e as últimas 100 invocações de Edge observadas foram `shopee-sync` v52 com HTTP 200. Porém, o sync regrava continuamente milhares de linhas: aproximadamente 5,06 M updates em pedidos, 5,15 M em itens, 1,68 M em carteira e 0,82 M em escrow desde o reset das estatísticas.

### Parecer

O sistema atende a operação interna de uma loja, mas **não está pronto para oferta multi-tenant**. A prioridade não é adicionar novos módulos: é fechar a exposição Data API/RLS, retirar credenciais do browser, tornar produção reproduzível e só então migrar os produtores legados para chaves compostas por conta/conexão. Até isso ocorrer, novos tenants ampliariam diretamente o raio de impacto.

## 2. Ambientes e matriz de drift

| Fonte | Identidade/estado | Papel na auditoria | Drift confirmado |
|---|---|---|---|
| Supabase produção | `qzcxukcwvjnhbnwpjceg`, Central de Bases Shopee, `sa-east-1`, PostgreSQL 17.6.1.104, saudável | Verdade do banco e funções | 16 migrations, 46 tabelas públicas, 33 views públicas, 8 Edge Functions |
| Supabase staging | `zgfehhqfodhspklbwhgc`, Mavis Staging, PostgreSQL 17.6.1.141, saudável | Comparação somente de metadados | Mesmo schema público; sem `ops`, cron/`pg_net` e três tabelas privadas legadas; 7 funções, geração v3 |
| Netlify produção | site `ecommerce-control-jv`; deploy `6a5709c3d792d67c4a8e22df`, publicado em 2026-07-15 04:17:11Z | Frontend servido | deploy CLI/manual, branch declarada `main`, `commit_ref` e `commit_url` nulos; runtime aponta para produção |
| GitHub `main` | `JVImports/E-commerce-Control`, HEAD observado `1b583ba` (2026-07-01) | Estado oficialmente versionado | não contém pasta/config Supabase, runtime config nem clientes novos de Auth |
| Branch/checkout | `codex/third-party-oauth-v3`, HEAD `480b6d8`, worktree suja | Trabalho em andamento | contém 7 funções e 2 migrations rastreadas + hardening de staging não rastreado; não representa integralmente produção |

### Drift de objetos

| Camada | Produção | Staging/local | Consequência |
|---|---|---|---|
| Edge prod-only | `shopee-sync`, `shopee-sync-product-ads`, `shopee-auth`, `shopee-auth-callback`, `shopee-auth-start` | sem fonte no checkout | manutenção/rollback não reprodutível |
| Edge staging/local-only | — | `shopee-oauth-v3`, `shopee-oauth-callback-v3`, `shopee-ads-import-v1`, `shopee-sync-v3` | frontend/DB parcialmente preparados, rollout incompleto |
| Edge comuns | `shopee-auth-v2`, `shopee-sync-v2`, `mavis-integrations-v1` | mesmos slugs, hashes diferentes | nome igual não implica código igual |
| Banco v3 | migration `third_party_oauth_v3` + hardening presentes | funções v3 somente staging | schema pronto, fluxo v3 não ativado em produção |
| Schema operacional | `ops` (2 tabelas, 4 views), 8 crons | ausente em staging | staging não reproduz operação/observabilidade |
| Credenciais | legado público/privado + Vault | staging concentra v3, sem dados analisados | coexistência temporária virou arquitetura dupla |

## 3. Registro priorizado de achados

| ID | Severidade | Confiança | Domínio | Objeto/evidência | Ação recomendada |
|---|---|---|---|---|---|
| F-01 | Crítica | Confirmado | Segurança/produto | 23 policies `anon ... USING (true)`; `HEAD` anônimo em `shopee_orders` retornou 7.202 linhas contáveis | Revogar acesso anônimo e substituir por policies de membership antes de qualquer novo tenant |
| F-02 | Crítica | Confirmado | Multi-tenant/produto | 18 policies `authenticated ... USING (true)` | Exigir `account_members`/conexão em toda leitura; testes negativos entre dois tenants |
| F-03 | Crítica | Confirmado | Financeiro/produto | `commerce_fee_settings_owner_all` permite `PUBLIC ALL` quando `user_id IS NULL`; grants DML existem | Bloquear writes de `anon`; separar defaults imutáveis de overrides por conta |
| F-04 | Alta | Confirmado | Credenciais/produto | tokens em claro em `public.shopee_shops`; partner keys em tabelas legadas | Migrar para Vault/secret refs privadas; projetar view sem colunas secretas |
| F-05 | Alta | Confirmado | Deploy/governança | Netlify manual sem commit; GitHub main sem Supabase; funções divergentes | Git-based deploy, migrations/funções versionadas, inventário de release com hashes |
| F-06 | Alta | Confirmado | Integração/produto | frontend chama `shopee-ads-import-v1`, ausente em produção | Ocultar feature ou implantar release coerente somente após gate e teste |
| F-07 | Alta | Confirmado | Modelo/produto | tabelas core sem `account_id`; PKs single-store; defaults fixos de loja/usuário | migrar para `account_id` + `connection_id` NOT NULL e uniques compostos |
| F-08 | Média | Confirmado | Auth/produto | proteção contra senhas vazadas desabilitada; 0 fatores MFA; 14 respostas 400 em `/token` na amostra | habilitar proteção; MFA/step-up para admins e conexão de marketplace |
| F-09 | Média | Confirmado | Performance/operação | milhões de updates sobre poucos milhares de linhas; `sync_log` 51,8 MB | evitar upsert de linhas inalteradas; registrar runs agregados |
| F-10 | Média | Confirmado | Integridade | 19.379/19.379 logs sem `account_id`; 8/15 estados e 92/368 snapshots UPSeller sem conta | backfill validado e impedir novos nulos |
| F-11 | Média | Inferido | Carteira | 278 transações com `order_sn` sem pedido correspondente | classificar tipos não vinculáveis; FK parcial/validação somente quando aplicável |
| F-12 | Média | Confirmado | OAuth/operação | 2 states legados expirados retidos; 1 start token privado ativo/não usado; v3 vazio | job de limpeza e TTL curto; manter valores fora de logs/URLs |
| F-13 | Média | Confirmado | Performance | 33 FKs sem índice; 32 policies com `auth_rls_initplan`; 37 sobreposições permissivas | priorizar FKs/RLS de tabelas ativas; consolidar policies |
| F-14 | Baixa | Confirmado | Índices/governança | três pares de índices idênticos | candidato à remoção somente após validar constraint/dependências e janela de métricas |

## 4. Mapa do schema, tabela por tabela

### 4.1 Inventário de schemas

| Schema | Objetos | Tratamento |
|---|---:|---|
| `public` | 46 tabelas, 33 views, 19 sequences | inventário completo abaixo; schema exposto e usado pela Data API |
| `private` | 5 tabelas | credenciais/estados; somente `service_role` tem grants de tabela |
| `ops` | 2 tabelas, 4 views, 1 sequence | observabilidade e lifecycle; sem USAGE para clientes |
| `auth` | 23 tabelas, 1 sequence | gerenciado; somente agregados de segurança, sem dados de usuário |
| `storage` | 8 tabelas | gerenciado; 0 buckets/0 objetos/0 policies do app |
| `realtime` | 3 tabelas, 1 sequence | gerenciado; publication `supabase_realtime` contém 0 tabelas |
| `cron` / `net` / `vault` | scheduler, HTTP assíncrono e cofre | inventariados por jobs/mecanismo/contagens; comandos e valores secretos redigidos |
| `extensions`, `graphql*`, `supabase_migrations`, `pgbouncer`, `archive` | infraestrutura/controle | excluídos do mapa coluna a coluna; sem objetos de negócio adicionais |

### 4.2 Tabelas de aplicação

| Objeto | Finalidade | Linhas | Tenant keys | PK | Última atividade | Produtor conhecido | Consumidor conhecido |
|---|---|---:|---|---|---|---|---|
| `ops.sync_log_retention_runs` | Auditoria das limpezas de sync_log | 16 | `nenhuma` | `(id)` | — | cron ops-prune-sync-log-daily | sem consumidor publicado confirmado |
| `ops.table_lifecycle_review` | Registro de classificação de ciclo de vida | 70 | `nenhuma` | `(table_schema, table_name)` | — | admin/manual/sem produtor confirmado | 1 view(s) |
| `private.shopee_app_secrets` | Cópia privada da chave de parceiro legada | 2 | `nenhuma` | `(app_id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `private.shopee_authorization_tokens` | Referências a tokens v3 no Vault | 0 | `authorization_id` | `(authorization_id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `private.shopee_oauth_start_tokens` | Cópia privada de tokens de início legados | 1 | `user_id` | `(token)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `private.shopee_oauth_states` | Cópia privada de estados OAuth legados | 0 | `user_id` | `(state)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `private.shopee_oauth_states_v3` | Estado OAuth v3 por hash/conta | 0 | `user_id, account_id` | `(state_hash)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.account_members` | Associação usuário–conta e papel | 3 | `account_id, user_id` | `(account_id, user_id)` | 2026-07-03 | migrations/admin | sem consumidor publicado confirmado |
| `public.accounts` | Contas/tenants do produto | 1 | `nenhuma` | `(id)` | 2026-06-23 | migrations/admin; Edge auth/v3 | sem consumidor publicado confirmado |
| `public.ads_cost_overrides` | Ajustes manuais de custo de mídia | 0 | `shop_id, user_id, account_id` | `(id)` | — | admin/manual/sem produtor confirmado | frontend |
| `public.cash_flow_projection` | Projeção financeira planejada | 0 | `user_id, account_id` | `(id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.commerce_fee_settings` | Comissões, tarifas e impostos configuráveis | 1 | `shop_id, user_id, account_id` | `(id)` | 2026-07-01 | admin/manual/sem produtor confirmado | frontend |
| `public.inventory_links` | Vínculo SKU externo–SKU interno | 0 | `nenhuma` | `(id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.landed_cost_entries` | Custo posto/importação por SKU | 0 | `user_id, account_id` | `(id)` | — | admin/manual/sem produtor confirmado | frontend |
| `public.product_cost_overrides` | Custo manual por item/variação/SKU | 0 | `shop_id, user_id, account_id` | `(id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.shopee_account_health` | Snapshots de saúde da conta Shopee | 0 | `shop_id` | `(id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.shopee_ads_balance` | Snapshots de saldo de Ads | 260 | `shop_id` | `(data_timestamp)` | 2026-07-16 | shopee-sync v52 via cron | 4 view(s) |
| `public.shopee_ads_daily_performance` | Fato diário agregado de Ads | 274 | `shop_id` | `(performance_date)` | 2026-07-16 | shopee-sync v52 via cron | frontend; 7 view(s) |
| `public.shopee_ads_import_batches` | Lotes de importação manual de Ads | 0 | `account_id, connection_id, shop_id` | `(id)` | — | shopee-ads-import-v1 (ausente em produção) | frontend |
| `public.shopee_ads_manual_daily` | Fato diário de Ads importado manualmente | 0 | `account_id, connection_id, shop_id` | `(id)` | — | RPC de shopee-ads-import-v1 (ausente em produção) | sem consumidor publicado confirmado |
| `public.shopee_ads_product_campaign_daily` | Fato diário de campanha por produto | 0 | `user_id, account_id, shop_id` | `(id)` | — | shopee-sync-v2; shopee-sync-product-ads | 1 view(s) |
| `public.shopee_ads_product_campaigns` | Dimensão/configuração de campanhas por produto | 0 | `user_id, account_id, shop_id` | `(id)` | — | shopee-sync-v2; shopee-sync-product-ads | sem consumidor publicado confirmado |
| `public.shopee_app_secrets` | Chave de parceiro legada em schema exposto, default-deny | 4 | `nenhuma` | `(app_id)` | 2026-07-03 | shopee-auth / shopee-auth-v2 | sem consumidor publicado confirmado |
| `public.shopee_apps` | Cadastro de aplicações Shopee | 4 | `user_id, account_id` | `(id)` | 2026-07-03 | shopee-auth / shopee-auth-v2 | sem consumidor publicado confirmado |
| `public.shopee_authorizations` | Autorização v3 por conta, sem tokens em claro | 0 | `account_id` | `(id)` | — | RPCs v3; funções v3 ausentes em produção | sem consumidor publicado confirmado |
| `public.shopee_connections` | Conexões v3 conta–loja | 2 | `authorization_id, account_id` | `(id)` | 2026-07-15 | migration v3; RPCs v3; bootstrap Mavis | frontend |
| `public.shopee_escrow` | Liquidação, comissões e taxas por pedido | 5730 | `shop_id` | `(order_sn)` | 2026-07-16 | shopee-sync v52; shopee-sync-v2 | 4 view(s) |
| `public.shopee_income_overview_snapshots` | Snapshot de valores a liberar/liberados | 1 | `shop_id` | `(snapshot_at)` | 2026-04-16 | shopee-sync v52/v2 | 1 view(s) |
| `public.shopee_logistics_events` | Eventos logísticos planejados | 0 | `shop_id` | `(id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.shopee_logistics_tracking` | Rastreamento de pacotes planejado | 0 | `shop_id` | `(order_sn, package_number)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.shopee_oauth_start_tokens` | Tokens de início OAuth legados, default-deny | 1 | `user_id` | `(token)` | 2026-07-03 | shopee-auth-start legada | sem consumidor publicado confirmado |
| `public.shopee_oauth_states` | Estados OAuth legados, default-deny | 2 | `user_id` | `(state)` | 2026-07-03 | shopee-auth* legadas | sem consumidor publicado confirmado |
| `public.shopee_order_items` | Itens de pedido | 7334 | `shop_id` | `(id)` | — | shopee-sync v52; shopee-sync-v2 | frontend; 6 view(s) |
| `public.shopee_orders` | Cabeçalhos de pedidos | 7202 | `shop_id` | `(order_sn)` | 2026-07-16 | shopee-sync v52; shopee-sync-v2 | frontend; 12 view(s) |
| `public.shopee_products` | Listagens/produtos Shopee | 76 | `shop_id` | `(item_id)` | 2026-07-16 | shopee-sync v52; shopee-sync-v2 | frontend; 8 view(s) |
| `public.shopee_returns` | Devoluções e reembolsos | 60 | `shop_id` | `(return_id)` | 2026-07-16 | shopee-sync v52 via cron | 4 view(s) |
| `public.shopee_reviews` | Avaliações planejadas | 0 | `shop_id` | `(comment_id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.shopee_shops` | Lojas legadas e tokens OAuth em claro | 6 | `user_id, shop_id, account_id` | `(id)` | 2026-07-16 | shopee-auth*, sync* | frontend; 2 view(s) |
| `public.shopee_variations` | Variações, preço e estoque | 199 | `shop_id` | `(model_id)` | 2026-07-16 | shopee-sync v52; shopee-sync-v2 | 6 view(s) |
| `public.shopee_vouchers` | Cupons/vouchers planejados | 0 | `shop_id` | `(voucher_id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.shopee_wallet_transactions` | Movimentos da carteira | 6043 | `shop_id` | `(transaction_id)` | 2026-07-16 | shopee-sync v52 via cron | 6 view(s) |
| `public.suppliers` | Fornecedores planejados | 0 | `user_id, account_id` | `(id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.sync_cursors` | Cursores estruturados planejados | 0 | `account_id, shop_id` | `(shop_id, module, cursor_key)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.sync_log` | Log operacional de sincronização | 19379 | `user_id, account_id` | `(id)` | 2026-07-16 | Edge Functions de sync | frontend; 1 view(s) |
| `public.sync_runs` | Execuções estruturadas planejadas | 0 | `account_id, shop_id` | `(id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.sync_state` | Estado/cursores chave–valor em uso | 15 | `user_id, account_id` | `(key)` | 2026-07-16 | Edge Functions de sync | 1 view(s) |
| `public.tiktok_orders` | Placeholder TikTok Shop | 0 | `nenhuma` | `(order_id)` | — | admin/manual/sem produtor confirmado | sem consumidor publicado confirmado |
| `public.upseller_catalog_imports` | Lotes de catálogo UPSeller | 1 | `user_id, account_id` | `(id)` | 2026-04-15 | ETL externo não presente no checkout | 1 view(s) |
| `public.upseller_kit_snapshot` | Composição de kits UPSeller | 124 | `user_id, account_id` | `(id)` | 2026-04-15 | ETL externo não presente no checkout | 1 view(s) |
| `public.upseller_product_snapshot` | Snapshot de produtos/custos UPSeller | 94 | `user_id, account_id` | `(id)` | 2026-04-15 | ETL externo não presente no checkout | 1 view(s) |
| `public.upseller_stock_imports` | Lotes de estoque UPSeller | 4 | `user_id, account_id` | `(id)` | 2026-07-01 | ETL externo não presente no checkout | frontend; 2 view(s) |
| `public.upseller_stock_settings` | Parâmetros de reposição planejados | 0 | `user_id, account_id` | `(sku)` | — | admin/manual/sem produtor confirmado | 1 view(s) |
| `public.upseller_stock_snapshot` | Snapshot de estoque/custo UPSeller | 368 | `user_id, account_id` | `(id)` | 2026-07-01 | ETL externo não presente no checkout | frontend; 1 view(s) |

Notas: contagens são agregadas no corte; staging não foi analisado quanto a dados. “Sem produtor confirmado” não significa desuso. Todas as 46 tabelas públicas têm RLS habilitado, mas isso é insuficiente porque as policies permissivas prevalecem.

### 4.3 Modelagem e constraints

- Integridade física positiva: PKs/FKs existentes estavam validadas; não há materialized views.
- Limite estrutural: `shopee_products(item_id)`, `shopee_variations(model_id)`, `shopee_orders(order_sn)`, `shopee_wallet_transactions(transaction_id)`, `shopee_returns(return_id)`, `shopee_ads_daily_performance(performance_date)`, `shopee_ads_balance(data_timestamp)` e `sync_state(key)` não incluem conta/conexão na PK.
- Várias tabelas antigas têm `shop_id` com default fixo de loja; várias tabelas de suporte têm default fixo de usuário. Os valores foram deliberadamente omitidos deste relatório.
- `shopee_returns`, `shopee_wallet_transactions`, reviews, custos e Ads por produto não possuem todas as FKs de negócio esperadas. Retornos órfãos = 0; referências de carteira sem pedido = 278, possivelmente tipos não ligados a pedidos.
- A FK composta de logística existe, mas as tabelas estão vazias e o índice correspondente foi apontado como ausente.

## 5. Views e fluxo ingestão → consumo

```text
Shopee API ──> Edge shopee-sync v52 (cron) ──> tabelas shopee_* ──> views vw_* ──> dashboard Netlify
                    └── sync_log/sync_state             └── app.js/hotfix/analisadores
UPSeller ETL externo ──> upseller_* snapshots ──────────┘
Importador Ads no browser ──> shopee-ads-import-v1 ──X──> AUSENTE em produção
OAuth v3 local/staging ──> RPCs + Vault refs ─────────X──> funções v3 ausentes em produção
```

Todas as 33 views públicas têm `security_invoker=true`, um ponto positivo. Isso faz com que obedeçam ao RLS subjacente — e, no estado atual, herdem também as policies excessivamente abertas.

| View | Dependências diretas | Consumidor publicado | Observação |
|---|---|---|---|
| `app_public_health` | constante | não confirmado | health estático, sem tabela-base |
| `shopee_ads_daily` | public.shopee_ads_daily_performance | sim | compatibilidade; `item_id` não é granularidade real |
| `vw_ads_daily` | public.shopee_ads_daily_performance | não confirmado | analytics/compatibilidade |
| `vw_ads_summary` | public.shopee_ads_balance, public.shopee_ads_daily_performance | sim | analytics/compatibilidade |
| `vw_catalog_summary` | public.shopee_products | sim | analytics/compatibilidade |
| `vw_financial_daily` | public.shopee_ads_daily_performance, public.shopee_escrow, public.shopee_orders, public.shopee_wallet_transactions, public.vw_returns_daily | sim | analytics/compatibilidade |
| `vw_financial_summary` | public.shopee_ads_balance, public.shopee_ads_daily_performance, public.shopee_escrow, public.shopee_income_overview_snapshots, public.shopee_returns, public.shopee_shops, public.shopee_wallet_transactions, public.vw_wallet_balance_latest | sim | analytics/compatibilidade |
| `vw_orders_daily` | public.shopee_orders | não confirmado | analytics/compatibilidade |
| `vw_orders_daily_status` | public.shopee_orders | não confirmado | analytics/compatibilidade |
| `vw_orders_monthly` | public.shopee_orders | não confirmado | analytics/compatibilidade |
| `vw_orders_status_summary` | public.shopee_orders | não confirmado | analytics/compatibilidade |
| `vw_product_ads_daily` | public.shopee_ads_product_campaign_daily | sim | analytics/compatibilidade |
| `vw_product_ads_summary` | public.vw_product_ads_daily | não confirmado | analytics/compatibilidade |
| `vw_product_performance_daily` | public.shopee_order_items, public.shopee_orders | sim | analytics/compatibilidade |
| `vw_product_performance_summary` | public.shopee_products, public.shopee_variations, public.vw_product_performance_daily, public.vw_product_variation_performance_summary, public.vw_upseller_stock_planning | sim | analytics/compatibilidade |
| `vw_product_variation_performance_summary` | public.shopee_order_items, public.shopee_orders, public.shopee_products, public.shopee_variations, public.vw_upseller_stock_planning | sim | analytics/compatibilidade |
| `vw_returns_daily` | public.shopee_returns | não confirmado | analytics/compatibilidade |
| `vw_sales_daily` | public.shopee_order_items, public.shopee_orders | sim | analytics/compatibilidade |
| `vw_sales_monthly` | public.shopee_order_items, public.shopee_orders | não confirmado | analytics/compatibilidade |
| `vw_sync_health` | public.shopee_ads_balance, public.shopee_ads_daily_performance, public.shopee_escrow, public.shopee_order_items, public.shopee_orders, public.shopee_products, public.shopee_returns, public.shopee_shops, public.shopee_variations, public.shopee_wallet_transactions | sim | analytics/compatibilidade |
| `vw_sync_latest_status` | public.sync_log | não confirmado | analytics/compatibilidade |
| `vw_sync_state_dashboard` | public.sync_state | não confirmado | expõe valores de cursor; retirar de `anon` |
| `vw_top_products` | public.shopee_products | não confirmado | sobrepõe `vw_product_performance_summary` |
| `vw_upseller_catalog_latest_import` | public.upseller_catalog_imports | não confirmado | analytics/compatibilidade |
| `vw_upseller_kit_components_latest` | public.upseller_kit_snapshot, public.vw_upseller_catalog_latest_import | não confirmado | analytics/compatibilidade |
| `vw_upseller_products_latest` | public.upseller_product_snapshot, public.vw_upseller_catalog_latest_import | não confirmado | analytics/compatibilidade |
| `vw_upseller_sku_daily_demand` | public.shopee_order_items, public.shopee_orders, public.shopee_products, public.shopee_variations, public.vw_upseller_kit_components_latest | sim | analytics/compatibilidade |
| `vw_upseller_stock_latest` | public.upseller_stock_imports, public.upseller_stock_snapshot | não confirmado | analytics/compatibilidade |
| `vw_upseller_stock_latest_import` | public.upseller_stock_imports | não confirmado | analytics/compatibilidade |
| `vw_upseller_stock_planning` | public.shopee_products, public.shopee_variations, public.upseller_stock_settings, public.vw_upseller_sku_daily_demand, public.vw_upseller_stock_latest, public.vw_upseller_stock_latest_import | sim | analytics/compatibilidade |
| `vw_upseller_stock_summary` | public.vw_upseller_stock_latest_import, public.vw_upseller_stock_planning | não confirmado | analytics/compatibilidade |
| `vw_wallet_balance_latest` | public.shopee_wallet_transactions | sim | analytics/compatibilidade |
| `vw_wallet_daily` | public.shopee_wallet_transactions | não confirmado | analytics/compatibilidade |

## 6. Mapa das Edge Functions

### 6.1 Produção implantada

| Função | v/JWT/hash | Ações/endpoint | Dados/APIs | Caller | Resiliência e atividade |
|---|---|---|---|---|---|
| `shopee-sync` | v52; JWT sim; `54a9faa5a418…` | refresh-token, status, sync-ads-balance, sync-ads-daily-step, sync-catalog, sync-escrow-step, sync-financial, sync-income-overview, sync-orders, sync-orders-step, sync-products, sync-returns-step, sync-variations, sync-wallet-step | Catálogo, variações, pedidos, itens, escrow, carteira, returns, Ads agregado, snapshots e sync state; Shopee Partner/Ads APIs | 7 jobs cron + shopee-multi-app.js | upsert/idempotência; retry; sem timeout externo confirmado; 100/100 eventos retornados; HTTP 200 |
| `shopee-sync-product-ads` | v3; JWT sim; `d061bf9c70e1…` | sync-product-ads | Campanhas e fatos de Ads por produto; apps/secrets/shops; Shopee Ads API | nenhum caller publicado conhecido | upsert/idempotência; retry; sem timeout externo confirmado; 0 na amostra limitada das últimas 100 |
| `shopee-auth` | v2; JWT sim; `329c9fb229d1…` | auth-shop, generate-oauth-url, link-manual-shop, list, register-app, unlink-shop | Apps, partner key, OAuth states e shops; OAuth Shopee | nenhum caller publicado conhecido | upsert/idempotência; sem timeout externo confirmado; 0 na amostra limitada das últimas 100 |
| `shopee-auth-callback` | v2; JWT não; `9e1d45a4892d…` | callback/start/bootstrap | Callback GET público autenticado por state expirável/one-time; grava shops/tokens | redirect OAuth legado externo | upsert/idempotência; sem timeout externo confirmado; 0 na amostra limitada das últimas 100 |
| `shopee-auth-start` | v2; JWT não; `ef1c4c431cb8…` | callback/start/bootstrap | Entrada pública por start token expirável/one-time; redireciona ao OAuth | link/token legado externo | sem timeout externo confirmado; 0 na amostra limitada das últimas 100 |
| `shopee-sync-v2` | v2; JWT sim; `b3a1c6364f6f…` | refresh-token, status, sync-catalog, sync-escrow-step, sync-financial, sync-income-overview, sync-orders-batch, sync-orders-step, sync-product-ads, sync-products, sync-variations | Membership, apps/secrets/shops; catálogo, pedidos/financeiro e Ads por produto | supabase-auth-sync-v2.js + ads-analyzer-product-ads.js | upsert/idempotência; retry; timeout externo; 0 na amostra limitada das últimas 100 |
| `shopee-auth-v2` | v1; JWT sim; `2bfdeca8b881…` | auth-shop, generate-oauth-url, link-manual-shop, list, register-app, unlink-shop | Auth de usuário + membership; apps/secrets/states/shops | shopee-multi-app.js + callback browser | upsert/idempotência; timeout externo; 0 na amostra limitada das últimas 100 |
| `mavis-integrations-v1` | v2; JWT sim; `75e194caf3af…` | bootstrap | Bootstrap somente leitura de conta, conexões e contagens | shopee-third-party-app.js | sem timeout externo confirmado; 0 na amostra limitada das últimas 100 |

Observações:

- As funções usam `SUPABASE_SERVICE_ROLE_KEY` no backend e, nas rotas de usuário, validam o bearer com `auth.getUser`; `mavis-integrations-v1` ainda verifica membership. Nenhum valor de env foi lido.
- `shopee-auth-callback` e `shopee-auth-start` têm JWT de gateway desabilitado, mas possuem state/start token expirável e de uso único no código. O risco principal é o legado/TTL/limpeza, não uma ausência completa de autenticação.
- O sync legado/v2 usa upsert/constraints e retries, mas não há transação única entre múltiplas tabelas; falhas intermediárias podem deixar módulos parcialmente atualizados.
- Amostra Edge (limitada a 100 eventos): 2026-07-16 16:00:58Z–21:50:58Z, somente `shopee-sync` v52, todos HTTP 200; duração min 2,0 s, p50 20,9 s, p95 70,7 s, máx 72,1 s. Ausência das demais nessa janela **não prova desuso**.

### 6.2 Reconciliação com staging e checkout

| Slug | Produção | Staging | Checkout | Conclusão |
|---|---|---|---|---|
| `mavis-integrations-v1` | v2 75e194caf3… | v3 d87cd5e2a2… | sim | mesmo slug, código diferente |
| `shopee-ads-import-v1` | — | v1 c11cc075f1… | sim | geração só em staging |
| `shopee-auth` | v2 329c9fb229… | — | não | legado só em produção |
| `shopee-auth-callback` | v2 9e1d45a489… | — | não | legado só em produção |
| `shopee-auth-start` | v2 ef1c4c431c… | — | não | legado só em produção |
| `shopee-auth-v2` | v1 2bfdeca8b8… | v1 6137b98f08… | sim | mesmo slug, código diferente |
| `shopee-oauth-callback-v3` | — | v1 ad39e3d0b8… | sim | geração só em staging |
| `shopee-oauth-v3` | — | v1 0bf50b7d02… | sim | geração só em staging |
| `shopee-sync` | v52 54a9faa5a4… | — | não | legado só em produção |
| `shopee-sync-product-ads` | v3 d061bf9c70… | — | não | legado só em produção |
| `shopee-sync-v2` | v2 b3a1c6364f… | v1 2a07913458… | sim | mesmo slug, código diferente |
| `shopee-sync-v3` | — | v1 89bb46bd3f… | sim | geração só em staging |

O checkout local coincide exatamente com o código implantado em staging para `shopee-oauth-v3`, `shopee-oauth-callback-v3`, `shopee-ads-import-v1`, `shopee-auth-v2` e `shopee-sync-v3` no fingerprint de fonte; `mavis-integrations-v1` e `shopee-sync-v2` têm alterações locais adicionais. Não há equivalência total com produção.

### 6.3 Contratos de execução, dependências e configuração

Somente os **nomes** das variáveis foram inventariados; valores e lista de secrets implantados não foram consultados. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são comuns às oito funções.

| Função | Leitura → escrita | Env adicional esperado | Dependência, idempotência e erro |
|---|---|---|---|
| `shopee-sync` | shops/orders/escrow/state → shops, produtos, variações, pedidos/itens, escrow, wallet, returns, income, Ads agregado e log/state | `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_SHOP_ID`, `SHOPEE_ACCESS_TOKEN`, `SHOPEE_REFRESH_TOKEN`, `SHOPEE_TOKEN_EXPIRE_IN`, `SHOPEE_BASE_URL`, `SHOPEE_ADS_BASE_URL`, `SHOPEE_REQUEST_DELAY_MS` | `supabase-js@2` não pinado; upsert; até 3 tentativas inclusive falha de rede/429/5xx; sem timeout de fetch; registra e devolve a mensagem de erro |
| `shopee-sync-product-ads` | shops/apps/secrets → campaigns/daily, token da loja e `sync_log` | `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_BASE_URL`, `SHOPEE_ADS_BASE_URL`, `SHOPEE_REQUEST_DELAY_MS` | `supabase-js@2` não pinado; upsert; até 3 respostas para 429/5xx, sem retry explícito de erro de rede e sem timeout; devolve a mensagem de erro |
| `shopee-auth` | apps/secrets/states/shops → os mesmos objetos, inclusive unlink | nenhum | `supabase-js@2` não pinado; upsert/delete por ação; troca OAuth sem retry/timeout; devolve erro com HTTP 400 |
| `shopee-auth-callback` | app/secret/state → shops + state consumido | nenhum | `supabase-js@2` não pinado; state com TTL/one-time e upsert de loja; troca OAuth sem retry/timeout; falha é exibida em HTML |
| `shopee-auth-start` | start token/app/secret → novo state + `last_used_at` | nenhum | `supabase-js@2` não pinado; não chama API externa, apenas assina/redireciona; token e state têm expiração/uso único; devolve erro textual |
| `shopee-sync-v2` | membership/shops/apps/secrets/orders/products/escrow/state → shops, catálogo, pedidos/itens, escrow/income, Ads por produto e log/state | `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_BASE_URL`, `SHOPEE_ADS_BASE_URL`, `SHOPEE_REQUEST_DELAY_MS` | `supabase-js@2.106.2`; membership owner/admin; upsert; até 3 tentativas para 429/5xx e timeout de 30 s; ações legadas não migradas retornam bloqueio explícito |
| `shopee-auth-v2` | membership/apps/secrets/states/shops → apps/secrets/states/shops | nenhum | `supabase-js@2.106.2`; membership owner/admin; upsert/delete; timeout de 30 s, sem retry; preserva status de `HttpError` |
| `mavis-integrations-v1` | membership/connections + contagens agregadas de catálogo, pedidos, financeiro, Ads e UPSeller → nenhuma escrita | `APP_ALLOWED_RETURN_ORIGINS`, `APP_RETURN_URL` | `supabase-js@2.106.2`; somente leitura; sem API externa; sanitiza erro 500 e devolve `correlation_id` |

Os fallbacks Shopee em variáveis de ambiente existem no código legado/v2, mas sua presença em produção não foi verificada. Nos fluxos por app, partner key e tokens ainda são lidos das tabelas legadas. Upsert reduz duplicação, porém não torna a execução atômica entre módulos; não há dead-letter queue nem chave formal de idempotência por run.

## 7. Checklist de cobertura de negócio

| Domínio | Status | Evidência e lacuna |
|---|---|---|
| 1. Catálogo/listagens | ⚠️ | Produtos, variações, atributos/imagens, status e categorias existem e estão ativos; falta modelo marketplace-agnostic, dimensão de categoria e chave de conta/conexão em todas as linhas. |
| 2. Preços/promoções | ⚠️ | Preço original/atual, desconto e flag promocional existem; vouchers estão vazios e não há histórico nem vigência por promoção. |
| 3. Pedidos/returns | ⚠️ | 7.202 pedidos, 7.334 itens e 60 returns, sem órfãos de return; PII está exposta e o modelo é Shopee-específico. |
| 4. Estoque | ⚠️ | Variações têm disponível/reservado; UPSeller tem snapshots/custo. Não há ledger de movimentos/reservas e o snapshot principal estava sem nova importação desde 2026-07-01. |
| 5. Tráfego/engajamento | ⚠️ | Totais de views/likes/sales no produto e métricas pagas; faltam fatos diários orgânicos, carrinho, funil e separação orgânico/pago. |
| 6. Ads | ⚠️ | Agregado diário ativo (274 dias); tabelas de campanha/produto estão vazias e o importador manual publicado não tem função em produção. |
| 7. Financeiro/COGS | ⚠️ | Escrow, comissão, serviço, wallet e fee settings existem. COGS aparece em snapshots UPSeller, mas landed cost e overrides estão vazios; não há P&L completo temporal por item. |
| 8. Carteira/repasses | ⚠️ | 6.043 transações, cron, views diária/saldo e snapshot de income; snapshot de income está parado desde 2026-04-16 e 278 referências de ordem precisam classificação. |
| 9. Multi-tenant/segurança | ❌ | `accounts/account_members` existem, mas RLS é global/anônimo em objetos core, tokens ficam no browser e chaves/PKs legadas não são compostas. |

## 8. Qualidade, integridade e atualidade dos dados

### 8.1 Volume e frescor de produção

| Objeto ativo | Linhas | Última atividade UTC | Avaliação |
|---|---:|---|---|
| `shopee_products` | 76 | 2026-07-16 18:07:08.398+00 | ativo/recente |
| `shopee_variations` | 199 | 2026-07-16 18:07:38.739+00 | ativo/recente |
| `shopee_orders` | 7202 | 2026-07-16 21:30:19.448+00 | ativo/recente |
| `shopee_order_items` | 7334 | — | ativo/recente |
| `shopee_escrow` | 5730 | 2026-07-16 21:30:56.443+00 | ativo/recente |
| `shopee_wallet_transactions` | 6043 | 2026-07-16 21:30:12.562+00 | ativo/recente |
| `shopee_returns` | 60 | 2026-07-16 21:31:10.29+00 | ativo/recente |
| `shopee_ads_balance` | 260 | 2026-07-16 18:15:03.162+00 | ativo/recente |
| `shopee_ads_daily_performance` | 274 | 2026-07-16 21:25:02.276+00 | ativo/recente |
| `sync_log` | 19379 | 2026-07-16 21:31:10.358+00 | ativo/recente |
| `sync_state` | 15 | 2026-07-16 21:30:56.641+00 | ativo/recente |
| `upseller_stock_snapshot` | 368 | 2026-07-01 16:55:25.508+00 | último lote em 2026-07-01 |
| `upseller_product_snapshot` | 94 | 2026-04-15 02:24:35.462275+00 | desatualizado |
| `upseller_kit_snapshot` | 124 | 2026-04-15 02:24:35.509411+00 | desatualizado |
| `shopee_income_overview_snapshots` | 1 | 2026-04-16 04:19:03.642+00 | desatualizado |

### 8.2 Integridade agregada

- Nulos críticos: zero em status/valor/datas principais de pedidos, itens, produtos, variações, escrow, returns e wallet; `buyer_username` é nulo em 19 pedidos (aceitabilidade depende da API/origem).
- Duplicidade potencial: 8 grupos repetidos na chave de negócio de item de pedido; 17 SKUs de produto e 58 SKUs de variação repetidos dentro da loja. Pode haver SKUs legitimamente reutilizados; exige análise humana.
- `shopee_shops`: 6 linhas, 2 lojas externas e 3 usuários; existem 2 grupos de `shop_id` repetido. O vínculo por usuário conflita com a futura autoridade por conta.
- Sem órfãos: returns→orders, reviews→orders e fatos de Ads/custos atualmente populados. Carteira→orders tem 278 referências sem pedido, possivelmente saques/ajustes.
- Tenancy: `sync_log.account_id` nulo em 19.379 linhas; `sync_state.account_id` nulo em 8/15; `upseller_stock_imports` 1/4 e `upseller_stock_snapshot` 92/368 sem conta. Não foram encontrados IDs de usuário/conta órfãos nas tabelas que os possuem.
- Tabelas vazias: 20 de 46 públicas. Vazio é evidência de não implementação/uso atual, não autorização de remoção.

### 8.3 Saúde de sync e cron

- Em 24 h, `sync_log` mostrou pares STARTED/SUCCESS para produtos, variações, Ads agregado, wallet, returns e escrow; orders tinha 144 STARTED/143 SUCCESS por existir uma execução iniciada após o último SUCCESS no corte.
- Os 8 jobs `pg_cron` estavam ativos e todas as execuções de 24 h foram `succeeded` no scheduler. Para jobs HTTP, isso prova enfileiramento `pg_net`, não o sucesso funcional; o log Edge complementa a evidência.

| Job | Agenda | Destino/mecanismo | Runs 24 h | Falhas scheduler |
|---|---|---|---:|---:|
| `shopee-sync-escrow-step-every-10-min` | `*/10 * * * *` | `shopee-sync` via pg_net/Vault | 144 | 0 |
| `shopee-sync-wallet-step-every-30-min` | `*/30 * * * *` | `shopee-sync` via pg_net/Vault | 48 | 0 |
| `shopee-sync-returns-step-every-30-min` | `*/30 * * * *` | `shopee-sync` via pg_net/Vault | 48 | 0 |
| `shopee-sync-catalog-every-6-hours` | `7 */6 * * *` | `shopee-sync` via pg_net/Vault | 4 | 0 |
| `shopee-sync-ads-balance-every-6-hours` | `15 */6 * * *` | `shopee-sync` via pg_net/Vault | 4 | 0 |
| `shopee-sync-ads-daily-step-hourly` | `25 * * * *` | `shopee-sync` via pg_net/Vault | 24 | 0 |
| `shopee-sync-orders-current-month-every-10-min` | `*/10 * * * *` | `shopee-sync` via pg_net/Vault | 144 | 0 |
| `ops-prune-sync-log-daily` | `35 3 * * *` | SQL ops.prune_sync_log | 1 | 0 |

## 9. Redundâncias e candidatos a descontinuação

| Objeto(s) | Recomendação | Dependências/impacto | Gate humano obrigatório |
|---|---|---|---|
| `public/private.shopee_app_secrets`, tokens em `shopee_shops` e desenho v3/Vault | **consolidar** | auth/sync legados ainda leem tabelas em claro | provar v3 em produção, rotacionar credenciais, observar erros e só então retirar legado |
| `public/private.shopee_oauth_states` e `oauth_start_tokens` | **arquivar legado** | `shopee-auth-callback/start` implantadas | confirmar URLs cadastradas na Shopee e tráfego por janela > ciclo de OAuth |
| `shopee-sync-product-ads` vs ação em `shopee-sync-v2` | **consolidar** | sem caller publicado do slug dedicado; tabelas ainda vazias | logs filtrados por função e teste de Ads real |
| `shopee-auth` vs `shopee-auth-v2`/v3 | **arquivar/candidato à remoção** | callback/start legados podem depender dele | inventário de redirect URIs, rollback e observação |
| `shopee_ads_daily` vs `vw_ads_daily` | **consolidar** | primeira é view de compatibilidade usada pelos analisadores | migrar frontend e comparar métricas |
| `vw_top_products` vs `vw_product_performance_summary` | **consolidar** | lifecycle já marca review; primeira usa contadores do catálogo | comparar todos os consumidores e resultados |
| `sync_cursors`/`sync_runs` vazias vs `sync_state`/`sync_log` | **manter uma arquitetura** | nova estrutura é melhor para multi-tenant, mas não está conectada | implementar produtor/consumidor antes de arquivar antiga |
| `cash_flow_projection`, `inventory_links`, logística, vouchers, suppliers, account_health, reviews, stock_settings, TikTok placeholder | **arquivar ou manter com dono/prazo** | vazias; algumas representam roadmap legítimo | decisão de produto; nenhuma é candidata automática a DROP |
| 3 pares de índices duplicados | **candidato à remoção** | Ads campaigns/daily e shops | confirmar qual índice sustenta constraint, backup e plano de rollback |

Nenhuma recomendação acima autoriza `DROP`. A classificação `candidato à remoção` exige validação humana explícita.

## 10. Lacunas e proposta de schema/serviços

### 10.1 Backbone multi-tenant proposto

1. Manter `accounts` e `account_members` como autoridade. Toda tabela de negócio deve carregar `account_id NOT NULL` e, quando aplicável, `connection_id NOT NULL`.
2. Substituir identidade Shopee-específica por `marketplace_connections(account_id, provider, environment, region, external_account_id, status, credential_ref)`; segredo somente em schema privado/Vault.
3. Separar catálogo canônico de listagem: `products`, `variants`, `marketplace_listings`, `listing_variants`, categorias/atributos/imagens e chaves únicas `(connection_id, external_id)`.
4. Generalizar pedidos e financeiro: `orders`, `order_items`, `returns`, `settlements`, `settlement_lines`, `fees`, `payouts`; conservar payload bruto privado com retenção definida, não como modelo primário.
5. Temporalizar preço/promoção: `price_history`, `promotions`, `promotion_items`, `coupons` com `valid_from/valid_to`, moeda e fonte.
6. Estoque: `inventory_locations`, `inventory_balances`, `inventory_movements`, `reservations` e snapshots; kits/BOM separados.
7. Tráfego/Ads: fatos diários por `connection_id`, listing/variant, canal e attribution; dimensões de campanha/ad group/ad; distinguir orgânico/pago.
8. COGS/P&L: `product_cost_history`, `landed_cost_components`, regras fiscais temporais e `order_item_profit_fact` reproduzível.
9. Operação: tornar `sync_runs`/`sync_cursors` a interface; idempotency key, status/contagens/erro sanitizado e lease por `(connection,module)`.

### 10.2 Contratos de serviço

- Uma função pública de usuário autentica JWT, resolve membership e passa somente `account_id/connection_id` autorizados ao serviço interno.
- Callbacks externos usam state hash one-time, TTL curto e RPC transacional; nunca retornam tokens ao browser.
- Sync por módulo é idempotente e incremental; upsert só quando hash/`updated_at` mudou.
- Cada release publica manifesto contendo migration versions, slugs/versions/hashes de Edge, commit do frontend e project ref alvo.

## 11. Segurança e prontidão multi-tenant

### 11.1 RLS/Data API

- **Confirmado:** Data API está funcional e o site usa chave `sb_publishable_...`; nenhuma chave `service_role` foi encontrada no bundle. A chave pública é correta no cliente, mas torna grants/RLS decisivos.
- **Falha crítica:** 23 objetos permitem leitura anônima integral. Entre eles: `shopee_orders`, `shopee_order_items`, `shopee_escrow`, `shopee_wallet_transactions`, `sync_log` e snapshots UPSeller.
- **Falha crítica:** 18 objetos permitem leitura integral a qualquer autenticado. Policies por `shop_id/user_id` coexistem, mas policies permissivas são combinadas com OR; a policy `true` vence.
- **Falha crítica de escrita:** default global de `commerce_fee_settings` pode ser manipulado por `anon` pela combinação de grants DML + `PUBLIC ALL` + `user_id IS NULL`.
- **Ponto positivo:** 33/33 views públicas usam `security_invoker=true`; tabelas privadas não concedem acesso a clientes; RPCs `SECURITY DEFINER` v3 estão restritas a `service_role/postgres` e têm `search_path` vazio.

### 11.2 Credenciais/Auth

- Tokens legados em `public.shopee_shops` são selecionáveis pelo dono da linha e portanto podem chegar ao browser. Criar view/API sem colunas de token não resolve enquanto a tabela continuar diretamente acessível.
- Há 4 app secrets públicas, 2 cópias privadas, 6 pares de tokens de loja e 2 secrets no Vault; zero `private.shopee_authorization_tokens`. O caminho Vault v3 ainda não recebeu tráfego.
- Leaked password protection está desabilitada; há 3 usuários confirmados, somente provider email, 5 sessões e nenhum fator MFA. Configuração de duração JWT, CAPTCHA, SMTP, redirect allowlist e signing keys não foi verificável pelas interfaces usadas.
- Auth logs retornados: 47 eventos numa janela de ~2 h; 14 respostas HTTP 400 em `/token`. Mensagens, emails e IPs não foram coletados.

### 11.3 SQL privilegiado e extensões

- 10 funções aplicacionais são `SECURITY DEFINER` (9 públicas e `ops.prune_sync_log`). As públicas privilegiadas estão limitadas a `service_role/postgres`; `ops` não concede USAGE a clientes, mitigando o EXECUTE default da função de prune.
- `pg_net` está instalado em `public` e foi alertado pelo advisor. Mover extensão requer planejamento porque os crons dependem dela.
- Não há policies de Storage porque não há buckets/objetos. `supabase_realtime` não publica tabelas e o frontend publicado não usa subscriptions.

## 12. Performance e operação

### Advisors reconciliados

| Advisor produção | Quantidade | Interpretação |
|---|---:|---|
| Security: RLS sem policy | 10 | private/default-deny e tabelas públicas de secrets/cursors; não é exposição por si só |
| Security: extensão em public | 1 | `pg_net`; risco/organização, com dependência cron real |
| Security: leaked password protection | 1 | ação de Auth recomendada |
| Performance: FK sem índice | 33 | priorizar tabelas ativas e colunas usadas em RLS/join |
| Performance: `auth_rls_initplan` | 32 | trocar `auth.uid()` por `(select auth.uid())` e indexar predicados |
| Performance: índices sem uso | 26 | não remover: muitos objetos são novos/vazios e a janela não foi comprovada |
| Performance: policies permissivas múltiplas | 37 | problema de custo e, neste caso, de segurança por OR |
| Performance: índices duplicados | 3 | candidatos após validar constraints/dependências |

### Hotspots

- `sync_log`: ~51,8 MB, 120.232 inserts e 100.850 deletes; retenção funciona, mas mensagens por linha e grants anônimos aumentam custo/risco.
- `shopee_orders`/`order_items`: ~5 M updates cada sobre ~7,2 k linhas; `shopee_wallet_transactions` ~1,68 M; `shopee_escrow` ~0,82 M. Implementar compare-before-write e páginas incrementais.
- `sync_state`: 15 linhas, ~6,54 M seq scans. O custo unitário é pequeno, mas demonstra polling/round trips excessivos.
- Edge legado: p95 ~70,7 s; abaixo do limite observado, porém suficientemente longo para sobreposição se a frequência aumentar.
- `pg_stat_statements` está instalado. Não foram exportadas queries; revisar top statements e planos após corrigir RLS para separar custo de policy, views e sync.

## 13. Plano de ação priorizado

### Quick wins — 0 a 48 horas

1. Congelar onboarding de novos tenants e tratar F-01/F-02/F-03 como incidente de segurança. Preservar logs e fazer avaliação LGPD; não copiar dados para o relatório.
2. Revogar `anon` nos 23 objetos de negócio e nas views correspondentes; remover policies `USING true`. Criar teste automatizado anônimo que exige 401/403/0 linhas.
3. Remover policies autenticadas globais e exigir membership por `account_id` ou join `shop_id → connection/account`; testes com dois usuários de contas distintas.
4. Bloquear writes de `anon` em `commerce_fee_settings` e separar configuração default de override tenant.
5. Ocultar o importador Ads ou implantar conjunto coerente em produção; não deixar caller apontando a slug inexistente.
6. Habilitar leaked password protection; definir MFA/step-up para owners/admins.

### Correções importantes — 1 a 2 semanas

1. Migrar tokens/partner keys para Vault ou secret manager; criar representação pública sem colunas secretas; rotacionar tudo que já foi armazenado/retornado ao browser.
2. Versionar baseline real de produção: schema, migrations, funções legadas e configs; escolher uma fonte e fechar drift antes do próximo deploy.
3. Tornar Netlify Git-based e registrar `commit_ref`; gate deve comparar project ref, migrations, slugs, JWT e hashes.
4. Backfill de `account_id` nos logs/state/UPSeller e em todas as tabelas core; depois `NOT NULL` + FKs/índices.
5. Consolidar policies e otimizar `(select auth.uid())`; adicionar índices de FK/tenant priorizados.
6. Reduzir write amplification e transformar `sync_runs` em resumo por execução; manter detalhe apenas quando necessário.
7. Limpar OAuth states expirados e reduzir TTL do start token; confirmar redirect URIs legadas.

### Mudanças estruturais — 2 a 8 semanas

1. Migrar para `connection_id`/provider-neutral e uniques compostos sem quebra de leitura.
2. Ativar v3 em canário com uma conta, RPCs transacionais e Vault; só depois aposentar auth/sync legados.
3. Implementar ledger de estoque, preço/promoções temporais, fatos de tráfego e P&L/COGS por item.
4. Criar observabilidade por SLO: frescor por módulo/tenant, atraso, erros, rows read/written, custo, retries e dead-letter/reprocessamento.
5. Revisar candidatos a descontinuação em janela representativa e com rollback; nenhuma remoção automática.

## 14. Apêndice de evidências e inventário

### 14.1 Fontes e precedência aplicadas

1. Supabase implantado: catálogo PostgreSQL, migrations, funções, código Edge, logs, advisors.
2. Netlify: metadados do deploy e artefatos públicos do deploy imutável.
3. GitHub `main`: connector oficial e commit observado.
4. Branch/worktree local: Git e arquivos locais, tratados como WIP.

Nenhuma consulta DDL/DML foi executada. A única chamada à Data API foi `HEAD`/count; nenhum registro foi retornado.

### 14.2 Migrations

**Produção (16):** `20260527222358_add_logistics_tracking`, `20260527222428_apply_logistics_tracking_schema`, `20260527223727_add_pg_cron_jobs`, `20260527224258_add_final_pillars`, `20260623170841_stabilize_shopee_sync_and_prepare_multitenant`, `20260623192653_prioritize_current_month_orders_sync`, `20260701160932_ops_log_retention_and_table_lifecycle`, `20260701161051_ops_classify_public_views_and_dedupe_sync_log_index`, `20260701162920_ads_analyzer_recreate_product_performance_views`, `20260701170107_ads_product_granularity_and_account_settings_v2`, `20260701170222_ads_campaign_item_mapping_fields`, `20260701205638_add_shopee_multi_app_credentials`, `20260701205809_adjust_shopee_auth_defaults`, `20260710185031_prepare_shopee_multi_shop_sync_keys`, `20260715042241_third_party_oauth_v3`, `20260715042622_harden_production_security_gate`.

**Staging (3):** `20260714215935_production_public_schema_baseline_20260714`, `20260714220204_third_party_oauth_v3`, `20260714220356_harden_staging_security_gate`.

### 14.3 Extensões instaladas em produção

`pgcrypto` 1.3 em `extensions`; `uuid-ossp` 1.1 em `extensions`; `supabase_vault` 0.3.1 em `vault`; `pg_stat_statements` 1.11 em `extensions`; `plpgsql` 1.0 em `pg_catalog`; `pg_net` 0.20.0 em `public`; `pg_cron` 1.6.4 em `pg_catalog`. As demais extensões listadas pelo catálogo estavam disponíveis, mas não instaladas.

### 14.4 Colunas e tipos — inventário completo dos schemas de aplicação

#### `public`

- `public.account_members` (table) — `account_id:uuid!`, `user_id:uuid!`, `role:text!`, `created_at:timestamp with time zone!`
- `public.accounts` (table) — `id:uuid!`, `name:text!`, `owner_user_id:uuid`, `plan:text!`, `status:text!`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`
- `public.ads_cost_overrides` (table) — `id:bigint!`, `shop_id:bigint`, `item_id:bigint`, `model_id:bigint`, `period_start:date`, `period_end:date`, `ads_cost_amount:numeric(12,2)!`, `notes:text`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`, `user_id:uuid`, `account_id:uuid`, `source:text!`
- `public.app_public_health` (view) — `status:text`, `app:text`, `checked_at:timestamp with time zone`
- `public.cash_flow_projection` (table) — `id:integer!`, `reference_month:date`, `projected_inflow:numeric(12,2)`, `projected_outflow:numeric(12,2)`, `synced_at:timestamp with time zone`, `user_id:uuid`, `account_id:uuid`
- `public.commerce_fee_settings` (table) — `id:bigint!`, `shop_id:bigint`, `marketplace:text!`, `commission_percent:numeric(8,4)!`, `fixed_fee_amount:numeric(12,2)!`, `service_fee_percent:numeric(8,4)!`, `tax_percent:numeric(8,4)!`, `is_default:boolean!`, `valid_from:date!`, `valid_to:date`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`, `user_id:uuid`, `account_id:uuid`
- `public.inventory_links` (table) — `id:integer!`, `model_id:bigint`, `internal_sku:text`, `quantity_on_hand:integer`, `reserved_quantity:integer`, `synced_at:timestamp with time zone`
- `public.landed_cost_entries` (table) — `id:integer!`, `sku:text`, `ii_value:numeric(12,2)`, `ipi_value:numeric(12,2)`, `pis_value:numeric(12,2)`, `cofins_value:numeric(12,2)`, `icms_value:numeric(12,2)`, `afrmm_value:numeric(12,2)`, `landed_cost:numeric(12,2)`, `synced_at:timestamp with time zone`, `user_id:uuid`, `account_id:uuid`
- `public.product_cost_overrides` (table) — `id:bigint!`, `shop_id:bigint`, `item_id:bigint`, `model_id:bigint`, `sku:text`, `cost_amount:numeric(12,2)!`, `notes:text`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`, `user_id:uuid`, `account_id:uuid`
- `public.shopee_account_health` (table) — `id:bigint!`, `snapshot_date:date!`, `penalty_points:numeric`, `non_fulfillment_rate:numeric`, `late_shipment_rate:numeric`, `synced_at:timestamp with time zone`, `shop_id:bigint`
- `public.shopee_ads_balance` (table) — `data_timestamp:bigint!`, `total_balance:numeric(12,2)`, `snapshot_at:timestamp with time zone`, `synced_at:timestamp with time zone`, `shop_id:bigint`
- `public.shopee_ads_daily` (view) — `date:date`, `item_id:bigint`, `shop_id:bigint`, `expense:numeric(12,2)`, `direct_gmv:numeric(12,2)`, `broad_gmv:numeric(12,2)`, `direct_roas:numeric(12,4)`, `broad_roas:numeric(12,4)`, `impression:integer`, `clicks:integer`, `synced_at:timestamp with time zone`
- `public.shopee_ads_daily_performance` (table) — `performance_date:date!`, `impression:integer`, `clicks:integer`, `ctr:numeric(12,4)`, `direct_order:integer`, `broad_order:integer`, `direct_conversions:numeric(12,4)`, `broad_conversions:numeric(12,4)`, `direct_item_sold:integer`, `broad_item_sold:integer`, `direct_gmv:numeric(12,2)`, `broad_gmv:numeric(12,2)`, `expense:numeric(12,2)`, `cost_per_conversion:numeric(12,2)`, `direct_roas:numeric(12,4)`, `broad_roas:numeric(12,4)`, `synced_at:timestamp with time zone`, `shop_id:bigint!`
- `public.shopee_ads_import_batches` (table) — `id:uuid!`, `account_id:uuid!`, `connection_id:uuid!`, `shop_id:bigint!`, `report_kind:text!`, `schema_version:integer!`, `file_name:text!`, `content_sha256:text!`, `period_start:date`, `period_end:date`, `row_count:integer!`, `replace_period:boolean!`, `status:text!`, `validation_summary:jsonb!`, `error_message:text`, `imported_by_user_id:uuid`, `imported_at:timestamp with time zone!`, `completed_at:timestamp with time zone`
- `public.shopee_ads_manual_daily` (table) — `id:bigint!`, `batch_id:uuid!`, `account_id:uuid!`, `connection_id:uuid!`, `shop_id:bigint!`, `performance_date:date!`, `campaign_id:text!`, `campaign_name:text`, `item_id:bigint!`, `model_id:bigint!`, `placement_key:text!`, `source_row_hash:text`, `impressions:bigint!`, `clicks:bigint!`, `orders:bigint!`, `expense:numeric(18,4)!`, `direct_gmv:numeric(18,4)!`, `broad_gmv:numeric(18,4)!`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`
- `public.shopee_ads_product_campaign_daily` (table) — `id:bigint!`, `user_id:uuid`, `account_id:uuid`, `shop_id:bigint!`, `item_id:bigint`, `campaign_id:bigint!`, `performance_date:date!`, `ad_type:text`, `ad_name:text`, `campaign_placement:text`, `impression:integer`, `clicks:integer`, `ctr:numeric(14,4)`, `expense:numeric(14,2)`, `broad_gmv:numeric(14,2)`, `broad_order:integer`, `broad_order_amount:integer`, `broad_roi:numeric(14,4)`, `broad_cir:numeric(14,4)`, `cr:numeric(14,4)`, `cpc:numeric(14,4)`, `direct_order:integer`, `direct_order_amount:integer`, `direct_gmv:numeric(14,2)`, `direct_roi:numeric(14,4)`, `direct_cir:numeric(14,4)`, `direct_cr:numeric(14,4)`, `cpdc:numeric(14,4)`, `raw_json:jsonb`, `synced_at:timestamp with time zone!`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`, `item_id_list:jsonb`
- `public.shopee_ads_product_campaigns` (table) — `id:bigint!`, `user_id:uuid`, `account_id:uuid`, `shop_id:bigint!`, `campaign_id:bigint!`, `item_id:bigint`, `ad_type:text`, `ad_name:text`, `campaign_placement:text`, `state:text`, `daily_budget:numeric(14,2)`, `total_budget:numeric(14,2)`, `start_date:date`, `end_date:date`, `raw_json:jsonb`, `synced_at:timestamp with time zone!`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`, `item_id_list:jsonb`, `product_status:text`
- `public.shopee_app_secrets` (table) — `app_id:uuid!`, `partner_key:text!`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`
- `public.shopee_apps` (table) — `id:uuid!`, `user_id:uuid!`, `account_id:uuid`, `app_name:text!`, `partner_id:bigint!`, `app_type:text!`, `environment:text!`, `base_url:text!`, `ads_base_url:text!`, `auth_base_url:text!`, `redirect_uri:text`, `status:text!`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`
- `public.shopee_authorizations` (table) — `id:uuid!`, `account_id:uuid!`, `provider_app_key:text!`, `environment:text!`, `region:text!`, `partner_id:bigint!`, `status:text!`, `authorized_by_user_id:uuid`, `authorized_at:timestamp with time zone`, `access_token_expires_at:timestamp with time zone`, `refresh_token_expires_at:timestamp with time zone`, `last_error_code:text`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`
- `public.shopee_connections` (table) — `id:uuid!`, `authorization_id:uuid`, `account_id:uuid!`, `provider:text!`, `environment:text!`, `region:text!`, `external_shop_id:bigint!`, `shop_name:text!`, `status:text!`, `authorized_by_user_id:uuid`, `authorized_at:timestamp with time zone`, `last_sync_at:timestamp with time zone`, `last_error:text`, `legacy_source:boolean!`, `metadata:jsonb!`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`
- `public.shopee_escrow` (table) — `order_sn:text!`, `buyer_total_amount:numeric(12,2)`, `escrow_amount:numeric(12,2)`, `final_shipping_fee:numeric(12,2)`, `commission_fee:numeric(12,2)`, `shopee_discount:numeric(12,2)`, `voucher_from_seller:numeric(12,2)`, `ship_rebate_from_shopee:numeric(12,2)`, `coin:numeric(12,2)`, `service_fee:numeric(12,2)`, `seller_return_refund:numeric(12,2)`, `synced_at:timestamp with time zone`, `shop_id:bigint!`
- `public.shopee_income_overview_snapshots` (table) — `snapshot_at:timestamp with time zone!`, `latest_payout_date:date`, `pending_amount:numeric(12,2)`, `to_release_amount:numeric(12,2)`, `released_amount:numeric(12,2)`, `synced_at:timestamp with time zone`, `shop_id:bigint!`
- `public.shopee_logistics_events` (table) — `id:bigint!`, `order_sn:text!`, `package_number:text!`, `update_time:timestamp with time zone`, `description:text`, `status:text`, `shop_id:bigint`
- `public.shopee_logistics_tracking` (table) — `order_sn:text!`, `package_number:text!`, `tracking_number:text`, `plp_number:text`, `logistics_status:text`, `synced_at:timestamp with time zone`, `shop_id:bigint`
- `public.shopee_oauth_start_tokens` (table) — `token:text!`, `user_id:uuid!`, `app_id:uuid!`, `shop_name:text`, `created_at:timestamp with time zone!`, `expires_at:timestamp with time zone!`, `last_used_at:timestamp with time zone`
- `public.shopee_oauth_states` (table) — `state:text!`, `user_id:uuid!`, `app_id:uuid!`, `shop_name:text`, `redirect_uri:text`, `created_at:timestamp with time zone!`, `expires_at:timestamp with time zone!`, `consumed_at:timestamp with time zone`
- `public.shopee_order_items` (table) — `id:integer!`, `line_key:text`, `order_sn:text`, `item_id:bigint`, `model_id:bigint`, `item_name:text`, `model_name:text`, `quantity:integer`, `unit_price:numeric(12,2)`, `shop_id:bigint!`
- `public.shopee_orders` (table) — `order_sn:text!`, `status:text`, `buyer_username:text`, `total_amount:numeric(12,2)`, `payment_method:text`, `items_summary:text`, `shipping_address:text`, `created_at:timestamp with time zone`, `updated_at:timestamp with time zone`, `synced_at:timestamp with time zone`, `shop_id:bigint!`
- `public.shopee_products` (table) — `item_id:bigint!`, `item_name:text`, `item_sku:text`, `item_status:text`, `category_id:bigint`, `has_model:boolean`, `weight_g:numeric(12,2)`, `width_cm:numeric(12,2)`, `height_cm:numeric(12,2)`, `length_cm:numeric(12,2)`, `image_url:text`, `views:integer`, `sales:integer`, `likes:integer`, `rating_star:numeric(12,2)`, `rating_count:integer`, `updated_at:timestamp with time zone`, `synced_at:timestamp with time zone`, `original_price:numeric(12,2)`, `current_price:numeric(12,2)`, `is_on_promotion:boolean`, `discount_amount:numeric(12,2)`, `discount_percent:numeric(12,2)`, `images_json:jsonb`, `video_info_json:jsonb`, `attributes_json:jsonb`, `shop_id:bigint!`
- `public.shopee_returns` (table) — `return_id:bigint!`, `order_sn:text`, `status:text`, `reason:text`, `refund_amount:numeric(12,2)`, `return_type:text`, `buyer_username:text`, `created_at:timestamp with time zone`, `updated_at:timestamp with time zone`, `synced_at:timestamp with time zone`, `shop_id:bigint`
- `public.shopee_reviews` (table) — `comment_id:bigint!`, `order_sn:text`, `item_id:bigint`, `rating_star:integer`, `comment:text`, `is_replied:boolean`, `created_at:timestamp with time zone`, `synced_at:timestamp with time zone`, `shop_id:bigint`
- `public.shopee_shops` (table) — `id:uuid!`, `user_id:uuid!`, `shop_id:bigint!`, `shop_name:text!`, `access_token:text`, `refresh_token:text`, `token_expire_in:timestamp with time zone`, `created_at:timestamp with time zone`, `updated_at:timestamp with time zone`, `account_id:uuid`, `app_id:uuid`, `connection_status:text!`, `auth_expires_at:timestamp with time zone`, `region:text`
- `public.shopee_variations` (table) — `model_id:bigint!`, `item_id:bigint`, `model_name:text`, `model_sku:text`, `original_price:numeric(12,2)`, `current_price:numeric(12,2)`, `stock_available:integer`, `stock_reserved:integer`, `synced_at:timestamp with time zone`, `is_on_promotion:boolean`, `discount_amount:numeric(12,2)`, `discount_percent:numeric(12,2)`, `shop_id:bigint!`
- `public.shopee_vouchers` (table) — `voucher_id:bigint!`, `voucher_code:text`, `voucher_name:text`, `discount_amount:numeric`, `usage_quantity:integer`, `status:text`, `start_time:timestamp with time zone`, `end_time:timestamp with time zone`, `synced_at:timestamp with time zone`, `shop_id:bigint`
- `public.shopee_wallet_transactions` (table) — `transaction_id:bigint!`, `transaction_type:text`, `amount:numeric(12,2)`, `status:text`, `order_sn:text`, `description:text`, `created_at:timestamp with time zone`, `synced_at:timestamp with time zone`, `current_balance:numeric(12,2)`, `money_flow:text`, `withdrawal_type:text`, `withdrawal_id:bigint`, `root_withdrawal_id:bigint`, `transaction_tab_type:text`, `shop_id:bigint`
- `public.suppliers` (table) — `id:integer!`, `supplier_name:text`, `supplier_code:text`, `lead_time_days:integer`, `moq:integer`, `synced_at:timestamp with time zone`, `user_id:uuid`, `account_id:uuid`
- `public.sync_cursors` (table) — `account_id:uuid`, `shop_id:bigint!`, `module:text!`, `cursor_key:text!`, `cursor_value:text`, `updated_at:timestamp with time zone!`
- `public.sync_log` (table) — `id:integer!`, `module:text`, `status:text`, `message:text`, `created_at:timestamp with time zone`, `user_id:uuid`, `account_id:uuid`
- `public.sync_runs` (table) — `id:uuid!`, `account_id:uuid`, `shop_id:bigint`, `module:text!`, `status:text!`, `started_at:timestamp with time zone!`, `finished_at:timestamp with time zone`, `records_read:integer`, `records_written:integer`, `error_message:text`, `metadata:jsonb!`
- `public.sync_state` (table) — `key:text!`, `value:text`, `updated_at:timestamp with time zone`, `user_id:uuid`, `account_id:uuid`
- `public.tiktok_orders` (table) — `order_id:text!`, `raw_payload:jsonb`, `synced_at:timestamp with time zone`
- `public.upseller_catalog_imports` (table) — `id:bigint!`, `source_folder_name:text`, `source_folder_path:text`, `products_file_name:text!`, `products_file_path:text`, `products_file_hash:text!`, `kits_file_name:text`, `kits_file_path:text`, `kits_file_hash:text`, `products_modified_at:timestamp with time zone`, `kits_modified_at:timestamp with time zone`, `product_sku_count:integer`, `kit_sku_count:integer`, `component_row_count:integer`, `imported_at:timestamp with time zone!`, `user_id:uuid`, `account_id:uuid`
- `public.upseller_kit_snapshot` (table) — `id:bigint!`, `import_id:bigint!`, `kit_sku:text!`, `kit_title:text`, `product_alias:text`, `use_alias_on_invoice:boolean`, `categories:text`, `is_active:boolean`, `image_url:text`, `component_sku:text!`, `component_qty:numeric(14,4)!`, `source_sheet:text`, `source_row_number:integer`, `imported_at:timestamp with time zone!`, `user_id:uuid`, `account_id:uuid`
- `public.upseller_product_snapshot` (table) — `id:bigint!`, `import_id:bigint!`, `sku:text!`, `spu:text`, `product_code:text`, `product_title:text`, `product_alias:text`, `use_alias_on_invoice:boolean`, `categories:text`, `variant_name_1:text`, `variant_value_1:text`, `variant_name_2:text`, `variant_value_2:text`, `variant_name_3:text`, `variant_value_3:text`, `variant_name_4:text`, `variant_value_4:text`, `variant_name_5:text`, `variant_value_5:text`, `launch_date:date`, `is_active:boolean`, `seller_name:text`, `retail_price:numeric(14,2)`, `purchase_cost:numeric(14,2)`, `image_url:text`, `sku_alias:text`, `source_sheet:text`, `source_row_number:integer`, `imported_at:timestamp with time zone!`, `user_id:uuid`, `account_id:uuid`
- `public.upseller_stock_imports` (table) — `id:bigint!`, `source_file_name:text!`, `source_file_path:text`, `file_hash:text!`, `source_modified_at:timestamp with time zone`, `source_sheet_count:integer`, `sku_count:integer`, `imported_at:timestamp with time zone!`, `user_id:uuid`, `account_id:uuid`
- `public.upseller_stock_settings` (table) — `sku:text!`, `replenish_enabled:boolean!`, `current_stock_qty:integer!`, `target_coverage_days:integer`, `supplier_lead_time_days:integer`, `manual_notes:text`, `updated_at:timestamp with time zone!`, `user_id:uuid`, `account_id:uuid`
- `public.upseller_stock_snapshot` (table) — `id:bigint!`, `import_id:bigint!`, `sku:text!`, `source_sheet:text`, `source_row_number:integer`, `imported_at:timestamp with time zone!`, `product_title:text`, `warehouse_name:text`, `shelf_name:text`, `low_stock_qty:numeric(14,2)`, `in_transit_purchase_qty:numeric(14,2)`, `in_transit_transfer_qty:numeric(14,2)`, `occupied_qty:numeric(14,2)`, `available_qty:numeric(14,2)`, `current_stock_qty:numeric(14,2)`, `average_cost:numeric(14,4)`, `subtotal_cost:numeric(14,2)`, `user_id:uuid`, `account_id:uuid`
- `public.vw_ads_daily` (view) — `performance_date:date`, `impression:integer`, `clicks:integer`, `expense:numeric(12,2)`, `direct_gmv:numeric(12,2)`, `broad_gmv:numeric(12,2)`, `direct_roas:numeric(12,4)`, `broad_roas:numeric(12,4)`, `synced_at:timestamp with time zone`, `shop_id:bigint`
- `public.vw_ads_summary` (view) — `shop_id:bigint`, `latest_total_balance:numeric(14,2)`, `latest_balance_at:timestamp with time zone`, `daily_rows:integer`, `total_expense:numeric`, `total_direct_gmv:numeric`, `total_broad_gmv:numeric`, `avg_direct_roas:numeric`, `avg_broad_roas:numeric`, `generated_at:timestamp with time zone`
- `public.vw_catalog_summary` (view) — `total_products:integer`, `with_variations:integer`, `without_variations:integer`, `total_views:bigint`, `total_sales:bigint`, `total_likes:bigint`, `avg_rating_star:numeric(12,2)`, `last_catalog_sync:timestamp with time zone`, `shop_id:bigint`
- `public.vw_financial_daily` (view) — `reference_date:date`, `escrow_amount:numeric(14,2)`, `commission_fee:numeric(14,2)`, `service_fee:numeric(14,2)`, `wallet_transactions_count:integer`, `wallet_amount:numeric(14,2)`, `wallet_in_amount:numeric(14,2)`, `wallet_out_amount:numeric(14,2)`, `withdrawal_completed_amount:numeric(14,2)`, `returns_count:integer`, `refund_amount:numeric(14,2)`, `ads_expense:numeric(14,2)`, `ads_direct_gmv:numeric(14,2)`, `ads_broad_gmv:numeric(14,2)`, `shop_id:bigint`
- `public.vw_financial_summary` (view) — `shop_id:bigint`, `total_escrow_amount:numeric`, `total_commission_fee:numeric`, `total_service_fee:numeric`, `total_wallet_amount:numeric`, `total_wallet_money_in:numeric`, `total_wallet_money_out:numeric`, `total_withdrawn_amount:numeric`, `total_withdrawal_requested_amount:numeric`, `total_refund_amount:numeric`, `total_ads_expense:numeric`, `latest_ads_balance:numeric`, `latest_income_snapshot_at:timestamp with time zone`, `processing_amount:numeric`, `to_release_amount:numeric`, `released_amount:numeric`, `latest_payout_date:date`, `latest_wallet_balance:numeric(14,2)`, `latest_wallet_balance_at:timestamp with time zone`, `generated_at:timestamp with time zone`
- `public.vw_orders_daily` (view) — `order_date:date`, `orders_count:integer`, `gross_amount:numeric(14,2)`, `shop_id:bigint`
- `public.vw_orders_daily_status` (view) — `order_date:date`, `status:text`, `orders_count:integer`, `gross_amount:numeric(14,2)`, `shop_id:bigint`
- `public.vw_orders_monthly` (view) — `reference_month:date`, `orders_count:integer`, `gross_amount:numeric(14,2)`, `avg_order_value:numeric(14,2)`, `shop_id:bigint`
- `public.vw_orders_status_summary` (view) — `status:text`, `orders_count:integer`, `gross_amount:numeric(14,2)`, `first_order_at:timestamp with time zone`, `last_order_at:timestamp with time zone`, `shop_id:bigint`
- `public.vw_product_ads_daily` (view) — `shop_id:bigint`, `user_id:uuid`, `item_id:bigint`, `performance_date:date`, `impression:integer`, `clicks:integer`, `ctr:numeric`, `expense:numeric(14,2)`, `direct_gmv:numeric(14,2)`, `broad_gmv:numeric(14,2)`, `direct_order:integer`, `broad_order:integer`, `direct_item_sold:integer`, `broad_item_sold:integer`, `direct_roas:numeric`, `broad_roas:numeric`, `synced_at:timestamp with time zone`
- `public.vw_product_ads_summary` (view) — `shop_id:bigint`, `user_id:uuid`, `item_id:bigint`, `total_ads_expense:numeric(14,2)`, `total_direct_gmv:numeric(14,2)`, `total_broad_gmv:numeric(14,2)`, `total_impression:integer`, `total_clicks:integer`, `ads_expense_7d:numeric(14,2)`, `ads_expense_15d:numeric(14,2)`, `ads_expense_30d:numeric(14,2)`, `direct_gmv_30d:numeric(14,2)`, `direct_roas_30d:numeric`, `synced_at:timestamp with time zone`
- `public.vw_product_performance_daily` (view) — `order_date:date`, `item_id:bigint`, `item_name:text`, `model_id:bigint`, `model_name:text`, `orders_count:integer`, `units_sold:bigint`, `gross_revenue:numeric(14,2)`, `shop_id:bigint`
- `public.vw_product_performance_summary` (view) — `item_id:bigint`, `item_name:text`, `item_sku:text`, `item_status:text`, `category_id:bigint`, `has_model:boolean`, `weight_g:numeric(12,2)`, `width_cm:numeric(12,2)`, `height_cm:numeric(12,2)`, `length_cm:numeric(12,2)`, `image_url:text`, `original_price:numeric(12,2)`, `current_price:numeric(12,2)`, `is_on_promotion:boolean`, `discount_amount:numeric(12,2)`, `discount_percent:numeric(12,2)`, `views:integer`, `sales:integer`, `orders_count:integer`, `units_sold:bigint`, `gross_revenue:numeric(14,2)`, `last_order_date:date`, `sales_7d:bigint`, `sales_15d:bigint`, `sales_30d:bigint`, `revenue_30d:numeric(14,2)`, `likes:integer`, `rating_star:numeric(12,2)`, `rating_count:integer`, `images_json:jsonb`, `video_info_json:jsonb`, `attributes_json:jsonb`, `shop_id:bigint`, `variation_count:integer`, `variation_stock_available:integer`, `min_variation_price:numeric`, `max_variation_price:numeric`, `upseller_average_cost:numeric(14,2)`, `upseller_available_qty:numeric(14,2)`, `product_stock_imported_at:timestamp with time zone`
- `public.vw_product_variation_performance_summary` (view) — `shop_id:bigint`, `item_id:bigint`, `item_name:text`, `item_status:text`, `has_model:boolean`, `model_id:bigint`, `model_name:text`, `model_sku:text`, `original_price:numeric(12,2)`, `current_price:numeric(12,2)`, `stock_available:integer`, `stock_reserved:integer`, `is_on_promotion:boolean`, `discount_amount:numeric(12,2)`, `discount_percent:numeric(12,2)`, `orders_count:integer`, `units_sold:bigint`, `gross_revenue:numeric(14,2)`, `last_order_date:date`, `units_sold_7d:bigint`, `units_sold_15d:bigint`, `units_sold_30d:bigint`, `revenue_30d:numeric(14,2)`, `upseller_average_cost:numeric(14,4)`, `upseller_reported_stock_qty:numeric(14,2)`, `upseller_available_qty:numeric(14,2)`, `stock_imported_at:timestamp with time zone`
- `public.vw_returns_daily` (view) — `return_date:date`, `returns_count:integer`, `refund_amount:numeric(14,2)`, `shop_id:bigint`
- `public.vw_sales_daily` (view) — `sales_date:date`, `orders_count:integer`, `units_sold:bigint`, `gross_revenue:numeric(14,2)`, `shop_id:bigint`
- `public.vw_sales_monthly` (view) — `reference_month:date`, `orders_count:integer`, `units_sold:bigint`, `gross_revenue:numeric(14,2)`, `avg_order_value:numeric`, `shop_id:bigint`
- `public.vw_sync_health` (view) — `shop_id:bigint`, `total_products:bigint`, `products_with_variations:bigint`, `total_variations:bigint`, `total_orders:bigint`, `total_order_items:bigint`, `total_escrow_rows:bigint`, `total_wallet_transactions:bigint`, `total_returns:bigint`, `total_ads_balance_snapshots:bigint`, `total_ads_daily_rows:bigint`, `generated_at:timestamp with time zone`
- `public.vw_sync_latest_status` (view) — `module:text`, `status:text`, `message:text`, `created_at:timestamp with time zone`, `user_id:uuid`
- `public.vw_sync_state_dashboard` (view) — `key:text`, `value:text`, `updated_at:timestamp with time zone`
- `public.vw_top_products` (view) — `item_id:bigint`, `item_name:text`, `item_sku:text`, `item_status:text`, `has_model:boolean`, `views:integer`, `sales:integer`, `likes:integer`, `rating_star:numeric(12,2)`, `rating_count:integer`, `synced_at:timestamp with time zone`, `shop_id:bigint`
- `public.vw_upseller_catalog_latest_import` (view) — `import_id:bigint`, `source_folder_name:text`, `source_folder_path:text`, `products_file_name:text`, `products_file_path:text`, `products_modified_at:timestamp with time zone`, `kits_file_name:text`, `kits_file_path:text`, `kits_modified_at:timestamp with time zone`, `product_sku_count:integer`, `kit_sku_count:integer`, `component_row_count:integer`, `imported_at:timestamp with time zone`, `user_id:uuid`
- `public.vw_upseller_kit_components_latest` (view) — `id:bigint`, `import_id:bigint`, `kit_sku:text`, `kit_title:text`, `product_alias:text`, `use_alias_on_invoice:boolean`, `categories:text`, `is_active:boolean`, `image_url:text`, `component_sku:text`, `component_qty:numeric(14,4)`, `source_sheet:text`, `source_row_number:integer`, `imported_at:timestamp with time zone`, `user_id:uuid`
- `public.vw_upseller_products_latest` (view) — `id:bigint`, `import_id:bigint`, `sku:text`, `spu:text`, `product_code:text`, `product_title:text`, `product_alias:text`, `use_alias_on_invoice:boolean`, `categories:text`, `variant_name_1:text`, `variant_value_1:text`, `variant_name_2:text`, `variant_value_2:text`, `variant_name_3:text`, `variant_value_3:text`, `variant_name_4:text`, `variant_value_4:text`, `variant_name_5:text`, `variant_value_5:text`, `launch_date:date`, `is_active:boolean`, `seller_name:text`, `retail_price:numeric(14,2)`, `purchase_cost:numeric(14,2)`, `image_url:text`, `sku_alias:text`, `source_sheet:text`, `source_row_number:integer`, `imported_at:timestamp with time zone`, `user_id:uuid`
- `public.vw_upseller_sku_daily_demand` (view) — `order_date:date`, `sku:text`, `orders_count:integer`, `direct_units_sold:numeric(14,4)`, `kit_component_units_sold:numeric(14,4)`, `total_units_sold:numeric(14,4)`, `shop_id:bigint`
- `public.vw_upseller_stock_latest` (view) — `import_id:bigint`, `sku:text`, `product_title:text`, `warehouse_name:text`, `shelf_name:text`, `low_stock_qty:numeric(14,2)`, `in_transit_purchase_qty:numeric(14,2)`, `in_transit_transfer_qty:numeric(14,2)`, `occupied_qty:numeric(14,2)`, `available_qty:numeric(14,2)`, `current_stock_qty:numeric(14,2)`, `average_cost:numeric(14,4)`, `subtotal_cost:numeric(14,2)`, `source_sheet:text`, `source_row_number:integer`, `source_file_name:text`, `source_file_path:text`, `source_modified_at:timestamp with time zone`, `imported_at:timestamp with time zone`, `user_id:uuid`
- `public.vw_upseller_stock_latest_import` (view) — `import_id:bigint`, `source_file_name:text`, `source_file_path:text`, `source_modified_at:timestamp with time zone`, `source_sheet_count:integer`, `sku_count:integer`, `imported_at:timestamp with time zone`, `user_id:uuid`
- `public.vw_upseller_stock_planning` (view) — `sku:text`, `source_file_name:text`, `source_modified_at:timestamp with time zone`, `stock_imported_at:timestamp with time zone`, `product_title:text`, `warehouse_name:text`, `shelf_name:text`, `low_stock_qty:numeric(14,2)`, `in_transit_purchase_qty:numeric(14,2)`, `in_transit_transfer_qty:numeric(14,2)`, `occupied_qty:numeric(14,2)`, `available_qty:numeric(14,2)`, `reported_stock_qty:numeric(14,2)`, `average_cost:numeric(14,4)`, `subtotal_cost:numeric(14,2)`, `item_id:bigint`, `item_name:text`, `model_id:bigint`, `model_name:text`, `match_type:text`, `current_price:numeric`, `original_price:numeric`, `replenish_enabled:boolean`, `target_coverage_days:integer`, `supplier_lead_time_days:integer`, `manual_notes:text`, `active_days_30d:integer`, `orders_count_30d:integer`, `direct_units_sold_30d:numeric`, `kit_component_units_sold_30d:numeric`, `units_sold_30d:numeric`, `avg_daily_units_30d:numeric`, `coverage_days:numeric`, `suggested_purchase_qty:integer`, `needs_replenishment:boolean`, `critical_sort_value:numeric`, `user_id:uuid`
- `public.vw_upseller_stock_summary` (view) — `import_id:bigint`, `source_file_name:text`, `source_modified_at:timestamp with time zone`, `imported_at:timestamp with time zone`, `sku_count:integer`, `planning_rows:integer`, `monitored_rows:integer`, `critical_rows:integer`, `unmatched_rows:integer`, `rows_with_stock_qty:integer`, `total_reported_stock_qty:numeric(14,2)`, `user_id:uuid`
- `public.vw_wallet_balance_latest` (view) — `transaction_id:bigint`, `transaction_type:text`, `status:text`, `current_balance:numeric(14,2)`, `balance_snapshot_at:timestamp with time zone`, `shop_id:bigint`
- `public.vw_wallet_daily` (view) — `txn_date:date`, `transactions_count:integer`, `net_amount:numeric(14,2)`, `shop_id:bigint`

#### `private`

- `private.shopee_app_secrets` (table) — `app_id:uuid!`, `partner_key:text!`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`
- `private.shopee_authorization_tokens` (table) — `authorization_id:uuid!`, `access_token_secret_id:uuid!`, `refresh_token_secret_id:uuid!`, `token_version:bigint!`, `created_at:timestamp with time zone!`, `updated_at:timestamp with time zone!`
- `private.shopee_oauth_start_tokens` (table) — `token:text!`, `user_id:uuid!`, `app_id:uuid!`, `shop_name:text`, `created_at:timestamp with time zone!`, `expires_at:timestamp with time zone!`, `last_used_at:timestamp with time zone`
- `private.shopee_oauth_states` (table) — `state:text!`, `user_id:uuid!`, `app_id:uuid!`, `shop_name:text`, `redirect_uri:text`, `created_at:timestamp with time zone!`, `expires_at:timestamp with time zone!`, `consumed_at:timestamp with time zone`
- `private.shopee_oauth_states_v3` (table) — `state_hash:text!`, `user_id:uuid!`, `account_id:uuid!`, `provider_app_key:text!`, `return_path:text!`, `status:text!`, `created_at:timestamp with time zone!`, `expires_at:timestamp with time zone!`, `claimed_at:timestamp with time zone`, `completed_at:timestamp with time zone`, `result_authorization_id:uuid`, `error_code:text`

#### `ops`

- `ops.cron_jobs` (view) — `jobid:bigint`, `jobname:text`, `schedule:text`, `active:boolean`, `command:text`
- `ops.sync_freshness` (view) — `module:text`, `latest_sync:timestamp with time zone`, `rows:bigint`
- `ops.sync_log_retention_runs` (table) — `id:bigint!`, `retention_days:integer!`, `keep_min_rows:integer!`, `deleted_rows:integer!`, `ran_at:timestamp with time zone!`
- `ops.table_inventory` (view) — `schema_name:name`, `object_name:name`, `object_type:text`, `estimated_rows:bigint`, `total_bytes:bigint`, `description:text`
- `ops.table_lifecycle_inventory` (view) — `table_schema:information_schema.sql_identifier`, `table_name:information_schema.sql_identifier`, `table_type:information_schema.character_data`, `lifecycle_status:text`, `owner_domain:text`, `recommended_action:text`, `rationale:text`, `estimated_rows:bigint`, `reviewed_at:timestamp with time zone`
- `ops.table_lifecycle_review` (table) — `table_schema:text!`, `table_name:text!`, `lifecycle_status:text!`, `owner_domain:text!`, `recommended_action:text!`, `rationale:text!`, `reviewed_at:timestamp with time zone!`

`!` indica NOT NULL. Defaults sensíveis/fixos foram omitidos intencionalmente.

### 14.5 Constraints — inventário completo

#### `public`

- `public.account_members` — `account_members_role_v3_check` [check, validada]: `CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'client'::text]))`; `account_members_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`; `account_members_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`; `account_members_pkey` [primary key, validada]: `PRIMARY KEY (account_id, user_id)`
- `public.accounts` — `accounts_owner_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL`; `accounts_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.ads_cost_overrides` — `ads_cost_overrides_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.cash_flow_projection` — `cash_flow_projection_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `cash_flow_projection_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `cash_flow_projection_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.commerce_fee_settings` — `commerce_fee_settings_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.inventory_links` — `inventory_links_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.landed_cost_entries` — `landed_cost_entries_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `landed_cost_entries_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `landed_cost_entries_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.product_cost_overrides` — `product_cost_overrides_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.shopee_account_health` — `shopee_account_health_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `shopee_account_health_snapshot_date_key` [unique, validada]: `UNIQUE (snapshot_date)`
- `public.shopee_ads_balance` — `shopee_ads_balance_pkey` [primary key, validada]: `PRIMARY KEY (data_timestamp)`
- `public.shopee_ads_daily_performance` — `shopee_ads_daily_performance_pkey` [primary key, validada]: `PRIMARY KEY (performance_date)`
- `public.shopee_ads_import_batches` — `shopee_ads_import_batches_status_check` [check, validada]: `CHECK (status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text]))`; `shopee_ads_import_batches_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`; `shopee_ads_import_batches_connection_id_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (connection_id, account_id) REFERENCES shopee_connections(id, account_id) ON DELETE CASCADE`; `shopee_ads_import_batches_imported_by_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (imported_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL`; `shopee_ads_import_batches_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `shopee_ads_import_batches_account_id_shop_id_content_sha256_key` [unique, validada]: `UNIQUE (account_id, shop_id, content_sha256)`
- `public.shopee_ads_manual_daily` — `shopee_ads_manual_daily_broad_gmv_check` [check, validada]: `CHECK (broad_gmv >= 0::numeric)`; `shopee_ads_manual_daily_clicks_check` [check, validada]: `CHECK (clicks >= 0)`; `shopee_ads_manual_daily_direct_gmv_check` [check, validada]: `CHECK (direct_gmv >= 0::numeric)`; `shopee_ads_manual_daily_expense_check` [check, validada]: `CHECK (expense >= 0::numeric)`; `shopee_ads_manual_daily_impressions_check` [check, validada]: `CHECK (impressions >= 0)`; `shopee_ads_manual_daily_orders_check` [check, validada]: `CHECK (orders >= 0)`; `shopee_ads_manual_daily_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`; `shopee_ads_manual_daily_batch_id_fkey` [foreign key, validada]: `FOREIGN KEY (batch_id) REFERENCES shopee_ads_import_batches(id) ON DELETE CASCADE`; `shopee_ads_manual_daily_connection_id_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (connection_id, account_id) REFERENCES shopee_connections(id, account_id) ON DELETE CASCADE`; `shopee_ads_manual_daily_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `shopee_ads_manual_daily_account_id_shop_id_performance_date_key` [unique, validada]: `UNIQUE (account_id, shop_id, performance_date, campaign_id, item_id, model_id, placement_key)`
- `public.shopee_ads_product_campaign_daily` — `shopee_ads_product_campaign_daily_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `shopee_ads_product_campaign_d_shop_id_campaign_id_performan_key` [unique, validada]: `UNIQUE (shop_id, campaign_id, performance_date)`
- `public.shopee_ads_product_campaigns` — `shopee_ads_product_campaigns_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `shopee_ads_product_campaigns_shop_id_campaign_id_key` [unique, validada]: `UNIQUE (shop_id, campaign_id)`
- `public.shopee_app_secrets` — `shopee_app_secrets_app_id_fkey` [foreign key, validada]: `FOREIGN KEY (app_id) REFERENCES shopee_apps(id) ON DELETE CASCADE`; `shopee_app_secrets_pkey` [primary key, validada]: `PRIMARY KEY (app_id)`
- `public.shopee_apps` — `shopee_apps_environment_check` [check, validada]: `CHECK (environment = ANY (ARRAY['live'::text, 'sandbox'::text]))`; `shopee_apps_status_check` [check, validada]: `CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'disabled'::text]))`; `shopee_apps_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `shopee_apps_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`; `shopee_apps_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `shopee_apps_user_id_partner_id_environment_key` [unique, validada]: `UNIQUE (user_id, partner_id, environment)`
- `public.shopee_authorizations` — `shopee_authorizations_environment_check` [check, validada]: `CHECK (environment = ANY (ARRAY['live'::text, 'sandbox'::text]))`; `shopee_authorizations_status_check` [check, validada]: `CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'reauthorization_required'::text, 'revoked'::text, 'error'::text]))`; `shopee_authorizations_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`; `shopee_authorizations_authorized_by_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (authorized_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL`; `shopee_authorizations_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.shopee_connections` — `shopee_connections_environment_check` [check, validada]: `CHECK (environment = ANY (ARRAY['live'::text, 'sandbox'::text]))`; `shopee_connections_provider_check` [check, validada]: `CHECK (provider = 'shopee'::text)`; `shopee_connections_status_check` [check, validada]: `CHECK (status = ANY (ARRAY['legacy_pending_reauth'::text, 'pending'::text, 'active'::text, 'reauthorization_required'::text, 'revoked'::text, 'disabled'::text, 'error'::text]))`; `shopee_connections_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`; `shopee_connections_authorization_id_fkey` [foreign key, validada]: `FOREIGN KEY (authorization_id) REFERENCES shopee_authorizations(id) ON DELETE SET NULL`; `shopee_connections_authorized_by_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (authorized_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL`; `shopee_connections_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `shopee_connections_id_account_id_key` [unique, validada]: `UNIQUE (id, account_id)`; `shopee_connections_provider_environment_region_external_sho_key` [unique, validada]: `UNIQUE (provider, environment, region, external_shop_id)`
- `public.shopee_escrow` — `shopee_escrow_order_sn_fkey` [foreign key, validada]: `FOREIGN KEY (order_sn) REFERENCES shopee_orders(order_sn)`; `shopee_escrow_pkey` [primary key, validada]: `PRIMARY KEY (order_sn)`
- `public.shopee_income_overview_snapshots` — `shopee_income_overview_snapshots_pkey` [primary key, validada]: `PRIMARY KEY (snapshot_at)`
- `public.shopee_logistics_events` — `shopee_logistics_events_order_sn_package_number_fkey` [foreign key, validada]: `FOREIGN KEY (order_sn, package_number) REFERENCES shopee_logistics_tracking(order_sn, package_number) ON DELETE CASCADE`; `shopee_logistics_events_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.shopee_logistics_tracking` — `shopee_logistics_tracking_pkey` [primary key, validada]: `PRIMARY KEY (order_sn, package_number)`
- `public.shopee_oauth_start_tokens` — `shopee_oauth_start_tokens_app_id_fkey` [foreign key, validada]: `FOREIGN KEY (app_id) REFERENCES shopee_apps(id) ON DELETE CASCADE`; `shopee_oauth_start_tokens_pkey` [primary key, validada]: `PRIMARY KEY (token)`
- `public.shopee_oauth_states` — `shopee_oauth_states_app_id_fkey` [foreign key, validada]: `FOREIGN KEY (app_id) REFERENCES shopee_apps(id) ON DELETE CASCADE`; `shopee_oauth_states_pkey` [primary key, validada]: `PRIMARY KEY (state)`
- `public.shopee_order_items` — `shopee_order_items_order_sn_fkey` [foreign key, validada]: `FOREIGN KEY (order_sn) REFERENCES shopee_orders(order_sn)`; `shopee_order_items_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `shopee_order_items_line_key_key` [unique, validada]: `UNIQUE (line_key)`
- `public.shopee_orders` — `shopee_orders_pkey` [primary key, validada]: `PRIMARY KEY (order_sn)`
- `public.shopee_products` — `shopee_products_pkey` [primary key, validada]: `PRIMARY KEY (item_id)`
- `public.shopee_returns` — `shopee_returns_pkey` [primary key, validada]: `PRIMARY KEY (return_id)`
- `public.shopee_reviews` — `shopee_reviews_pkey` [primary key, validada]: `PRIMARY KEY (comment_id)`
- `public.shopee_shops` — `shopee_shops_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `shopee_shops_app_id_fkey` [foreign key, validada]: `FOREIGN KEY (app_id) REFERENCES shopee_apps(id) ON DELETE SET NULL`; `shopee_shops_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`; `shopee_shops_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `unique_user_shop` [unique, validada]: `UNIQUE (user_id, shop_id)`
- `public.shopee_variations` — `shopee_variations_item_id_fkey` [foreign key, validada]: `FOREIGN KEY (item_id) REFERENCES shopee_products(item_id)`; `shopee_variations_pkey` [primary key, validada]: `PRIMARY KEY (model_id)`
- `public.shopee_vouchers` — `shopee_vouchers_pkey` [primary key, validada]: `PRIMARY KEY (voucher_id)`
- `public.shopee_wallet_transactions` — `shopee_wallet_transactions_pkey` [primary key, validada]: `PRIMARY KEY (transaction_id)`
- `public.suppliers` — `suppliers_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `suppliers_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `suppliers_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.sync_cursors` — `sync_cursors_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`; `sync_cursors_pkey` [primary key, validada]: `PRIMARY KEY (shop_id, module, cursor_key)`
- `public.sync_log` — `sync_log_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `sync_log_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `sync_log_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.sync_runs` — `sync_runs_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `sync_runs_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.sync_state` — `sync_state_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `sync_state_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `sync_state_pkey` [primary key, validada]: `PRIMARY KEY (key)`
- `public.tiktok_orders` — `tiktok_orders_pkey` [primary key, validada]: `PRIMARY KEY (order_id)`
- `public.upseller_catalog_imports` — `upseller_catalog_imports_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `upseller_catalog_imports_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `upseller_catalog_imports_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.upseller_kit_snapshot` — `upseller_kit_snapshot_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `upseller_kit_snapshot_import_id_fkey` [foreign key, validada]: `FOREIGN KEY (import_id) REFERENCES upseller_catalog_imports(id) ON DELETE CASCADE`; `upseller_kit_snapshot_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `upseller_kit_snapshot_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `upseller_kit_snapshot_import_id_kit_sku_component_sku_sourc_key` [unique, validada]: `UNIQUE (import_id, kit_sku, component_sku, source_row_number)`
- `public.upseller_product_snapshot` — `upseller_product_snapshot_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `upseller_product_snapshot_import_id_fkey` [foreign key, validada]: `FOREIGN KEY (import_id) REFERENCES upseller_catalog_imports(id) ON DELETE CASCADE`; `upseller_product_snapshot_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `upseller_product_snapshot_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `upseller_product_snapshot_import_id_sku_key` [unique, validada]: `UNIQUE (import_id, sku)`
- `public.upseller_stock_imports` — `upseller_stock_imports_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `upseller_stock_imports_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `upseller_stock_imports_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `public.upseller_stock_settings` — `upseller_stock_settings_current_stock_qty_check` [check, validada]: `CHECK (current_stock_qty >= 0)`; `upseller_stock_settings_supplier_lead_time_days_check` [check, validada]: `CHECK (supplier_lead_time_days IS NULL OR supplier_lead_time_days >= 0)`; `upseller_stock_settings_target_coverage_days_check` [check, validada]: `CHECK (target_coverage_days IS NULL OR target_coverage_days > 0)`; `upseller_stock_settings_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `upseller_stock_settings_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `upseller_stock_settings_pkey` [primary key, validada]: `PRIMARY KEY (sku)`
- `public.upseller_stock_snapshot` — `upseller_stock_snapshot_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL`; `upseller_stock_snapshot_import_id_fkey` [foreign key, validada]: `FOREIGN KEY (import_id) REFERENCES upseller_stock_imports(id) ON DELETE CASCADE`; `upseller_stock_snapshot_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`; `upseller_stock_snapshot_pkey` [primary key, validada]: `PRIMARY KEY (id)`; `upseller_stock_snapshot_import_id_sku_key` [unique, validada]: `UNIQUE (import_id, sku)`

#### `private`

- `private.shopee_app_secrets` — `shopee_app_secrets_app_id_fkey` [foreign key, validada]: `FOREIGN KEY (app_id) REFERENCES shopee_apps(id) ON DELETE CASCADE`; `shopee_app_secrets_pkey` [primary key, validada]: `PRIMARY KEY (app_id)`
- `private.shopee_authorization_tokens` — `shopee_authorization_tokens_authorization_id_fkey` [foreign key, validada]: `FOREIGN KEY (authorization_id) REFERENCES shopee_authorizations(id) ON DELETE CASCADE`; `shopee_authorization_tokens_pkey` [primary key, validada]: `PRIMARY KEY (authorization_id)`; `shopee_authorization_tokens_access_token_secret_id_key` [unique, validada]: `UNIQUE (access_token_secret_id)`; `shopee_authorization_tokens_refresh_token_secret_id_key` [unique, validada]: `UNIQUE (refresh_token_secret_id)`
- `private.shopee_oauth_start_tokens` — `shopee_oauth_start_tokens_app_id_fkey` [foreign key, validada]: `FOREIGN KEY (app_id) REFERENCES shopee_apps(id) ON DELETE CASCADE`; `shopee_oauth_start_tokens_pkey` [primary key, validada]: `PRIMARY KEY (token)`
- `private.shopee_oauth_states` — `shopee_oauth_states_app_id_fkey` [foreign key, validada]: `FOREIGN KEY (app_id) REFERENCES shopee_apps(id) ON DELETE CASCADE`; `shopee_oauth_states_pkey` [primary key, validada]: `PRIMARY KEY (state)`
- `private.shopee_oauth_states_v3` — `shopee_oauth_states_v3_status_check` [check, validada]: `CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))`; `shopee_oauth_states_v3_account_id_fkey` [foreign key, validada]: `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE`; `shopee_oauth_states_v3_result_authorization_id_fkey` [foreign key, validada]: `FOREIGN KEY (result_authorization_id) REFERENCES shopee_authorizations(id) ON DELETE SET NULL`; `shopee_oauth_states_v3_user_id_fkey` [foreign key, validada]: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`; `shopee_oauth_states_v3_pkey` [primary key, validada]: `PRIMARY KEY (state_hash)`

#### `ops`

- `ops.sync_log_retention_runs` — `sync_log_retention_runs_pkey` [primary key, validada]: `PRIMARY KEY (id)`
- `ops.table_lifecycle_review` — `table_lifecycle_review_pkey` [primary key, validada]: `PRIMARY KEY (table_schema, table_name)`

### 14.6 Índices — inventário completo e scans acumulados

#### `public`

- `public.account_members` — `account_members_pkey` [PK], scans=4: `CREATE UNIQUE INDEX account_members_pkey ON public.account_members USING btree (account_id, user_id)`; `idx_account_members_user_id`, scans=0: `CREATE INDEX idx_account_members_user_id ON public.account_members USING btree (user_id)`
- `public.accounts` — `accounts_pkey` [PK], scans=101384: `CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (id)`
- `public.ads_cost_overrides` — `ads_cost_overrides_pkey` [PK], scans=0: `CREATE UNIQUE INDEX ads_cost_overrides_pkey ON public.ads_cost_overrides USING btree (id)`; `idx_ads_cost_overrides_lookup`, scans=0: `CREATE INDEX idx_ads_cost_overrides_lookup ON public.ads_cost_overrides USING btree (shop_id, item_id, model_id, period_start, period_end)`; `idx_ads_cost_overrides_user_lookup`, scans=0: `CREATE INDEX idx_ads_cost_overrides_user_lookup ON public.ads_cost_overrides USING btree (user_id, shop_id, item_id, model_id, period_start, period_end)`
- `public.cash_flow_projection` — `cash_flow_projection_pkey` [PK], scans=7: `CREATE UNIQUE INDEX cash_flow_projection_pkey ON public.cash_flow_projection USING btree (id)`
- `public.commerce_fee_settings` — `commerce_fee_settings_pkey` [PK], scans=1: `CREATE UNIQUE INDEX commerce_fee_settings_pkey ON public.commerce_fee_settings USING btree (id)`; `idx_commerce_fee_settings_user_lookup`, scans=0: `CREATE INDEX idx_commerce_fee_settings_user_lookup ON public.commerce_fee_settings USING btree (user_id, shop_id, marketplace, is_default)`
- `public.inventory_links` — `inventory_links_pkey` [PK], scans=5: `CREATE UNIQUE INDEX inventory_links_pkey ON public.inventory_links USING btree (id)`
- `public.landed_cost_entries` — `landed_cost_entries_pkey` [PK], scans=4: `CREATE UNIQUE INDEX landed_cost_entries_pkey ON public.landed_cost_entries USING btree (id)`
- `public.product_cost_overrides` — `idx_product_cost_overrides_lookup`, scans=0: `CREATE INDEX idx_product_cost_overrides_lookup ON public.product_cost_overrides USING btree (shop_id, item_id, model_id, sku)`; `idx_product_cost_overrides_user_lookup`, scans=0: `CREATE INDEX idx_product_cost_overrides_user_lookup ON public.product_cost_overrides USING btree (user_id, shop_id, item_id, model_id, sku)`; `product_cost_overrides_pkey` [PK], scans=0: `CREATE UNIQUE INDEX product_cost_overrides_pkey ON public.product_cost_overrides USING btree (id)`
- `public.shopee_account_health` — `shopee_account_health_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_account_health_pkey ON public.shopee_account_health USING btree (id)`; `shopee_account_health_snapshot_date_key` [U], scans=0: `CREATE UNIQUE INDEX shopee_account_health_snapshot_date_key ON public.shopee_account_health USING btree (snapshot_date)`
- `public.shopee_ads_balance` — `idx_shopee_ads_balance_snapshot_at`, scans=1: `CREATE INDEX idx_shopee_ads_balance_snapshot_at ON public.shopee_ads_balance USING btree (snapshot_at DESC)`; `shopee_ads_balance_pkey` [PK], scans=260: `CREATE UNIQUE INDEX shopee_ads_balance_pkey ON public.shopee_ads_balance USING btree (data_timestamp)`
- `public.shopee_ads_daily_performance` — `idx_shopee_ads_daily_performance_date`, scans=4140: `CREATE INDEX idx_shopee_ads_daily_performance_date ON public.shopee_ads_daily_performance USING btree (performance_date DESC)`; `idx_shopee_ads_daily_shop_date`, scans=10: `CREATE INDEX idx_shopee_ads_daily_shop_date ON public.shopee_ads_daily_performance USING btree (shop_id, performance_date DESC)`; `shopee_ads_daily_performance_pkey` [PK], scans=136710: `CREATE UNIQUE INDEX shopee_ads_daily_performance_pkey ON public.shopee_ads_daily_performance USING btree (performance_date)`; `shopee_ads_daily_performance_shop_date_uidx` [U], scans=0: `CREATE UNIQUE INDEX shopee_ads_daily_performance_shop_date_uidx ON public.shopee_ads_daily_performance USING btree (shop_id, performance_date)`
- `public.shopee_ads_import_batches` — `shopee_ads_import_batches_account_date_idx`, scans=0: `CREATE INDEX shopee_ads_import_batches_account_date_idx ON public.shopee_ads_import_batches USING btree (account_id, imported_at DESC)`; `shopee_ads_import_batches_account_id_shop_id_content_sha256_key` [U], scans=0: `CREATE UNIQUE INDEX shopee_ads_import_batches_account_id_shop_id_content_sha256_key ON public.shopee_ads_import_batches USING btree (account_id, shop_id, content_sha256)`; `shopee_ads_import_batches_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_ads_import_batches_pkey ON public.shopee_ads_import_batches USING btree (id)`
- `public.shopee_ads_manual_daily` — `shopee_ads_manual_daily_account_id_shop_id_performance_date_key` [U], scans=0: `CREATE UNIQUE INDEX shopee_ads_manual_daily_account_id_shop_id_performance_date_key ON public.shopee_ads_manual_daily USING btree (account_id, shop_id, performance_date, campaign_id, item_id, model_id, placement_key)`; `shopee_ads_manual_daily_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_ads_manual_daily_pkey ON public.shopee_ads_manual_daily USING btree (id)`; `shopee_ads_manual_daily_shop_date_idx`, scans=0: `CREATE INDEX shopee_ads_manual_daily_shop_date_idx ON public.shopee_ads_manual_daily USING btree (account_id, shop_id, performance_date DESC)`
- `public.shopee_ads_product_campaign_daily` — `idx_ads_product_campaign_daily_item_date`, scans=1: `CREATE INDEX idx_ads_product_campaign_daily_item_date ON public.shopee_ads_product_campaign_daily USING btree (shop_id, item_id, performance_date)`; `idx_ads_product_campaign_daily_user_date`, scans=0: `CREATE INDEX idx_ads_product_campaign_daily_user_date ON public.shopee_ads_product_campaign_daily USING btree (user_id, performance_date)`; `shopee_ads_product_campaign_d_shop_id_campaign_id_performan_key` [U], scans=0: `CREATE UNIQUE INDEX shopee_ads_product_campaign_d_shop_id_campaign_id_performan_key ON public.shopee_ads_product_campaign_daily USING btree (shop_id, campaign_id, performance_date)`; `shopee_ads_product_campaign_daily_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_ads_product_campaign_daily_pkey ON public.shopee_ads_product_campaign_daily USING btree (id)`; `shopee_ads_product_campaign_daily_shop_campaign_date_uidx` [U], scans=54: `CREATE UNIQUE INDEX shopee_ads_product_campaign_daily_shop_campaign_date_uidx ON public.shopee_ads_product_campaign_daily USING btree (shop_id, campaign_id, performance_date)`
- `public.shopee_ads_product_campaigns` — `idx_ads_product_campaigns_item`, scans=1: `CREATE INDEX idx_ads_product_campaigns_item ON public.shopee_ads_product_campaigns USING btree (shop_id, item_id)`; `idx_ads_product_campaigns_item_list`, scans=0: `CREATE INDEX idx_ads_product_campaigns_item_list ON public.shopee_ads_product_campaigns USING gin (item_id_list)`; `idx_ads_product_campaigns_user`, scans=0: `CREATE INDEX idx_ads_product_campaigns_user ON public.shopee_ads_product_campaigns USING btree (user_id, shop_id)`; `shopee_ads_product_campaigns_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_ads_product_campaigns_pkey ON public.shopee_ads_product_campaigns USING btree (id)`; `shopee_ads_product_campaigns_shop_campaign_uidx` [U], scans=0: `CREATE UNIQUE INDEX shopee_ads_product_campaigns_shop_campaign_uidx ON public.shopee_ads_product_campaigns USING btree (shop_id, campaign_id)`; `shopee_ads_product_campaigns_shop_id_campaign_id_key` [U], scans=0: `CREATE UNIQUE INDEX shopee_ads_product_campaigns_shop_id_campaign_id_key ON public.shopee_ads_product_campaigns USING btree (shop_id, campaign_id)`
- `public.shopee_app_secrets` — `shopee_app_secrets_pkey` [PK], scans=19: `CREATE UNIQUE INDEX shopee_app_secrets_pkey ON public.shopee_app_secrets USING btree (app_id)`
- `public.shopee_apps` — `idx_shopee_apps_account_id`, scans=7: `CREATE INDEX idx_shopee_apps_account_id ON public.shopee_apps USING btree (account_id)`; `idx_shopee_apps_user_id`, scans=12: `CREATE INDEX idx_shopee_apps_user_id ON public.shopee_apps USING btree (user_id)`; `shopee_apps_pkey` [PK], scans=23: `CREATE UNIQUE INDEX shopee_apps_pkey ON public.shopee_apps USING btree (id)`; `shopee_apps_user_id_partner_id_environment_key` [U], scans=8: `CREATE UNIQUE INDEX shopee_apps_user_id_partner_id_environment_key ON public.shopee_apps USING btree (user_id, partner_id, environment)`
- `public.shopee_authorizations` — `shopee_authorizations_account_status_idx`, scans=0: `CREATE INDEX shopee_authorizations_account_status_idx ON public.shopee_authorizations USING btree (account_id, status)`; `shopee_authorizations_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_authorizations_pkey ON public.shopee_authorizations USING btree (id)`
- `public.shopee_connections` — `shopee_connections_account_status_idx`, scans=9: `CREATE INDEX shopee_connections_account_status_idx ON public.shopee_connections USING btree (account_id, status)`; `shopee_connections_authorization_idx`, scans=0: `CREATE INDEX shopee_connections_authorization_idx ON public.shopee_connections USING btree (authorization_id)`; `shopee_connections_authorized_by_idx`, scans=0: `CREATE INDEX shopee_connections_authorized_by_idx ON public.shopee_connections USING btree (authorized_by_user_id)`; `shopee_connections_id_account_id_key` [U], scans=0: `CREATE UNIQUE INDEX shopee_connections_id_account_id_key ON public.shopee_connections USING btree (id, account_id)`; `shopee_connections_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_connections_pkey ON public.shopee_connections USING btree (id)`; `shopee_connections_provider_environment_region_external_sho_key` [U], scans=2: `CREATE UNIQUE INDEX shopee_connections_provider_environment_region_external_sho_key ON public.shopee_connections USING btree (provider, environment, region, external_shop_id)`
- `public.shopee_escrow` — `idx_shopee_escrow_shop_order`, scans=588: `CREATE INDEX idx_shopee_escrow_shop_order ON public.shopee_escrow USING btree (shop_id, order_sn)`; `idx_shopee_escrow_synced_at`, scans=13: `CREATE INDEX idx_shopee_escrow_synced_at ON public.shopee_escrow USING btree (synced_at DESC)`; `shopee_escrow_pkey` [PK], scans=830181: `CREATE UNIQUE INDEX shopee_escrow_pkey ON public.shopee_escrow USING btree (order_sn)`; `shopee_escrow_shop_order_uidx` [U], scans=275: `CREATE UNIQUE INDEX shopee_escrow_shop_order_uidx ON public.shopee_escrow USING btree (shop_id, order_sn)`
- `public.shopee_income_overview_snapshots` — `shopee_income_overview_snapshots_pkey` [PK], scans=2: `CREATE UNIQUE INDEX shopee_income_overview_snapshots_pkey ON public.shopee_income_overview_snapshots USING btree (snapshot_at)`; `shopee_income_overview_snapshots_shop_snapshot_uidx` [U], scans=0: `CREATE UNIQUE INDEX shopee_income_overview_snapshots_shop_snapshot_uidx ON public.shopee_income_overview_snapshots USING btree (shop_id, snapshot_at)`
- `public.shopee_logistics_events` — `shopee_logistics_events_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_logistics_events_pkey ON public.shopee_logistics_events USING btree (id)`
- `public.shopee_logistics_tracking` — `shopee_logistics_tracking_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_logistics_tracking_pkey ON public.shopee_logistics_tracking USING btree (order_sn, package_number)`
- `public.shopee_oauth_start_tokens` — `shopee_oauth_start_tokens_pkey` [PK], scans=6: `CREATE UNIQUE INDEX shopee_oauth_start_tokens_pkey ON public.shopee_oauth_start_tokens USING btree (token)`
- `public.shopee_oauth_states` — `idx_public_shopee_oauth_states_expires_at`, scans=2: `CREATE INDEX idx_public_shopee_oauth_states_expires_at ON public.shopee_oauth_states USING btree (expires_at)`; `idx_public_shopee_oauth_states_user_app`, scans=0: `CREATE INDEX idx_public_shopee_oauth_states_user_app ON public.shopee_oauth_states USING btree (user_id, app_id)`; `shopee_oauth_states_pkey` [PK], scans=2: `CREATE UNIQUE INDEX shopee_oauth_states_pkey ON public.shopee_oauth_states USING btree (state)`
- `public.shopee_order_items` — `idx_shopee_order_items_item_model_shop`, scans=68: `CREATE INDEX idx_shopee_order_items_item_model_shop ON public.shopee_order_items USING btree (item_id, model_id, shop_id)`; `idx_shopee_order_items_order_sn`, scans=9589: `CREATE INDEX idx_shopee_order_items_order_sn ON public.shopee_order_items USING btree (order_sn)`; `idx_shopee_order_items_shop_item`, scans=18: `CREATE INDEX idx_shopee_order_items_shop_item ON public.shopee_order_items USING btree (shop_id, item_id)`; `shopee_order_items_line_key_key` [U], scans=5160734: `CREATE UNIQUE INDEX shopee_order_items_line_key_key ON public.shopee_order_items USING btree (line_key)`; `shopee_order_items_pkey` [PK], scans=7: `CREATE UNIQUE INDEX shopee_order_items_pkey ON public.shopee_order_items USING btree (id)`; `shopee_order_items_shop_line_uidx` [U], scans=0: `CREATE UNIQUE INDEX shopee_order_items_shop_line_uidx ON public.shopee_order_items USING btree (shop_id, line_key)`
- `public.shopee_orders` — `idx_shopee_orders_created_at`, scans=154: `CREATE INDEX idx_shopee_orders_created_at ON public.shopee_orders USING btree (created_at)`; `idx_shopee_orders_shop_created`, scans=5: `CREATE INDEX idx_shopee_orders_shop_created ON public.shopee_orders USING btree (shop_id, created_at DESC)`; `idx_shopee_orders_status`, scans=114: `CREATE INDEX idx_shopee_orders_status ON public.shopee_orders USING btree (status)`; `idx_shopee_orders_synced_at`, scans=13: `CREATE INDEX idx_shopee_orders_synced_at ON public.shopee_orders USING btree (synced_at DESC)`; `shopee_orders_pkey` [PK], scans=5081748: `CREATE UNIQUE INDEX shopee_orders_pkey ON public.shopee_orders USING btree (order_sn)`; `shopee_orders_shop_order_uidx` [U], scans=42: `CREATE UNIQUE INDEX shopee_orders_shop_order_uidx ON public.shopee_orders USING btree (shop_id, order_sn)`
- `public.shopee_products` — `idx_shopee_products_shop_item`, scans=24: `CREATE INDEX idx_shopee_products_shop_item ON public.shopee_products USING btree (shop_id, item_id)`; `idx_shopee_products_status`, scans=2: `CREATE INDEX idx_shopee_products_status ON public.shopee_products USING btree (item_status)`; `idx_shopee_products_synced_at`, scans=164: `CREATE INDEX idx_shopee_products_synced_at ON public.shopee_products USING btree (synced_at DESC)`; `idx_shopee_products_updated_at`, scans=0: `CREATE INDEX idx_shopee_products_updated_at ON public.shopee_products USING btree (updated_at)`; `shopee_products_pkey` [PK], scans=87783: `CREATE UNIQUE INDEX shopee_products_pkey ON public.shopee_products USING btree (item_id)`; `shopee_products_shop_item_uidx` [U], scans=36: `CREATE UNIQUE INDEX shopee_products_shop_item_uidx ON public.shopee_products USING btree (shop_id, item_id)`
- `public.shopee_returns` — `idx_shopee_returns_created_at`, scans=0: `CREATE INDEX idx_shopee_returns_created_at ON public.shopee_returns USING btree (created_at)`; `idx_shopee_returns_order_sn`, scans=1: `CREATE INDEX idx_shopee_returns_order_sn ON public.shopee_returns USING btree (order_sn)`; `shopee_returns_pkey` [PK], scans=222817: `CREATE UNIQUE INDEX shopee_returns_pkey ON public.shopee_returns USING btree (return_id)`
- `public.shopee_reviews` — `shopee_reviews_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_reviews_pkey ON public.shopee_reviews USING btree (comment_id)`
- `public.shopee_shops` — `idx_shopee_shops_account_id`, scans=2: `CREATE INDEX idx_shopee_shops_account_id ON public.shopee_shops USING btree (account_id)`; `idx_shopee_shops_app_id`, scans=0: `CREATE INDEX idx_shopee_shops_app_id ON public.shopee_shops USING btree (app_id)`; `idx_shopee_shops_user_shop`, scans=0: `CREATE INDEX idx_shopee_shops_user_shop ON public.shopee_shops USING btree (user_id, shop_id)`; `idx_shopee_shops_user_shop_id`, scans=1: `CREATE INDEX idx_shopee_shops_user_shop_id ON public.shopee_shops USING btree (user_id, shop_id)`; `shopee_shops_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_shops_pkey ON public.shopee_shops USING btree (id)`; `unique_user_shop` [U], scans=511: `CREATE UNIQUE INDEX unique_user_shop ON public.shopee_shops USING btree (user_id, shop_id)`
- `public.shopee_variations` — `idx_shopee_variations_item_id`, scans=299: `CREATE INDEX idx_shopee_variations_item_id ON public.shopee_variations USING btree (item_id)`; `idx_shopee_variations_synced_at`, scans=154: `CREATE INDEX idx_shopee_variations_synced_at ON public.shopee_variations USING btree (synced_at DESC)`; `shopee_variations_pkey` [PK], scans=215893: `CREATE UNIQUE INDEX shopee_variations_pkey ON public.shopee_variations USING btree (model_id)`; `shopee_variations_shop_model_uidx` [U], scans=0: `CREATE UNIQUE INDEX shopee_variations_shop_model_uidx ON public.shopee_variations USING btree (shop_id, model_id)`
- `public.shopee_vouchers` — `shopee_vouchers_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_vouchers_pkey ON public.shopee_vouchers USING btree (voucher_id)`
- `public.shopee_wallet_transactions` — `idx_shopee_wallet_created_at`, scans=6: `CREATE INDEX idx_shopee_wallet_created_at ON public.shopee_wallet_transactions USING btree (created_at)`; `idx_shopee_wallet_order_sn`, scans=0: `CREATE INDEX idx_shopee_wallet_order_sn ON public.shopee_wallet_transactions USING btree (order_sn)`; `idx_shopee_wallet_shop_created`, scans=11: `CREATE INDEX idx_shopee_wallet_shop_created ON public.shopee_wallet_transactions USING btree (shop_id, created_at DESC)`; `shopee_wallet_transactions_pkey` [PK], scans=1689700: `CREATE UNIQUE INDEX shopee_wallet_transactions_pkey ON public.shopee_wallet_transactions USING btree (transaction_id)`
- `public.suppliers` — `suppliers_pkey` [PK], scans=5: `CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)`
- `public.sync_cursors` — `sync_cursors_pkey` [PK], scans=0: `CREATE UNIQUE INDEX sync_cursors_pkey ON public.sync_cursors USING btree (shop_id, module, cursor_key)`
- `public.sync_log` — `idx_sync_log_account_created`, scans=1: `CREATE INDEX idx_sync_log_account_created ON public.sync_log USING btree (account_id, created_at DESC)`; `idx_sync_log_module_created_at`, scans=148: `CREATE INDEX idx_sync_log_module_created_at ON public.sync_log USING btree (module, created_at DESC)`; `idx_sync_log_user_created`, scans=1: `CREATE INDEX idx_sync_log_user_created ON public.sync_log USING btree (user_id, created_at DESC)`; `sync_log_created_at_idx`, scans=34: `CREATE INDEX sync_log_created_at_idx ON public.sync_log USING btree (created_at DESC)`; `sync_log_pkey` [PK], scans=36: `CREATE UNIQUE INDEX sync_log_pkey ON public.sync_log USING btree (id)`
- `public.sync_runs` — `sync_runs_pkey` [PK], scans=0: `CREATE UNIQUE INDEX sync_runs_pkey ON public.sync_runs USING btree (id)`
- `public.sync_state` — `idx_sync_state_updated_at`, scans=0: `CREATE INDEX idx_sync_state_updated_at ON public.sync_state USING btree (updated_at DESC)`; `idx_sync_state_user_key`, scans=0: `CREATE INDEX idx_sync_state_user_key ON public.sync_state USING btree (user_id, key)`; `sync_state_pkey` [PK], scans=56242: `CREATE UNIQUE INDEX sync_state_pkey ON public.sync_state USING btree (key)`
- `public.tiktok_orders` — `tiktok_orders_pkey` [PK], scans=3: `CREATE UNIQUE INDEX tiktok_orders_pkey ON public.tiktok_orders USING btree (order_id)`
- `public.upseller_catalog_imports` — `idx_upseller_catalog_imports_kits_hash`, scans=0: `CREATE INDEX idx_upseller_catalog_imports_kits_hash ON public.upseller_catalog_imports USING btree (kits_file_hash)`; `idx_upseller_catalog_imports_products_hash`, scans=1: `CREATE INDEX idx_upseller_catalog_imports_products_hash ON public.upseller_catalog_imports USING btree (products_file_hash)`; `upseller_catalog_imports_pkey` [PK], scans=218: `CREATE UNIQUE INDEX upseller_catalog_imports_pkey ON public.upseller_catalog_imports USING btree (id)`
- `public.upseller_kit_snapshot` — `idx_upseller_kit_snapshot_component_sku`, scans=1: `CREATE INDEX idx_upseller_kit_snapshot_component_sku ON public.upseller_kit_snapshot USING btree (component_sku)`; `idx_upseller_kit_snapshot_import_id`, scans=0: `CREATE INDEX idx_upseller_kit_snapshot_import_id ON public.upseller_kit_snapshot USING btree (import_id)`; `idx_upseller_kit_snapshot_kit_sku`, scans=0: `CREATE INDEX idx_upseller_kit_snapshot_kit_sku ON public.upseller_kit_snapshot USING btree (kit_sku)`; `upseller_kit_snapshot_import_id_kit_sku_component_sku_sourc_key` [U], scans=124: `CREATE UNIQUE INDEX upseller_kit_snapshot_import_id_kit_sku_component_sku_sourc_key ON public.upseller_kit_snapshot USING btree (import_id, kit_sku, component_sku, source_row_number)`; `upseller_kit_snapshot_pkey` [PK], scans=0: `CREATE UNIQUE INDEX upseller_kit_snapshot_pkey ON public.upseller_kit_snapshot USING btree (id)`
- `public.upseller_product_snapshot` — `idx_upseller_product_snapshot_import_id`, scans=0: `CREATE INDEX idx_upseller_product_snapshot_import_id ON public.upseller_product_snapshot USING btree (import_id)`; `idx_upseller_product_snapshot_sku`, scans=1: `CREATE INDEX idx_upseller_product_snapshot_sku ON public.upseller_product_snapshot USING btree (sku)`; `upseller_product_snapshot_import_id_sku_key` [U], scans=94: `CREATE UNIQUE INDEX upseller_product_snapshot_import_id_sku_key ON public.upseller_product_snapshot USING btree (import_id, sku)`; `upseller_product_snapshot_pkey` [PK], scans=0: `CREATE UNIQUE INDEX upseller_product_snapshot_pkey ON public.upseller_product_snapshot USING btree (id)`
- `public.upseller_stock_imports` — `idx_upseller_stock_imports_account_imported`, scans=0: `CREATE INDEX idx_upseller_stock_imports_account_imported ON public.upseller_stock_imports USING btree (account_id, imported_at DESC)`; `idx_upseller_stock_imports_file_hash`, scans=0: `CREATE INDEX idx_upseller_stock_imports_file_hash ON public.upseller_stock_imports USING btree (file_hash)`; `upseller_stock_imports_pkey` [PK], scans=112: `CREATE UNIQUE INDEX upseller_stock_imports_pkey ON public.upseller_stock_imports USING btree (id)`
- `public.upseller_stock_settings` — `idx_upseller_stock_settings_enabled`, scans=0: `CREATE INDEX idx_upseller_stock_settings_enabled ON public.upseller_stock_settings USING btree (replenish_enabled)`; `upseller_stock_settings_pkey` [PK], scans=20706: `CREATE UNIQUE INDEX upseller_stock_settings_pkey ON public.upseller_stock_settings USING btree (sku)`
- `public.upseller_stock_snapshot` — `idx_upseller_stock_snapshot_account_sku`, scans=9: `CREATE INDEX idx_upseller_stock_snapshot_account_sku ON public.upseller_stock_snapshot USING btree (account_id, sku)`; `idx_upseller_stock_snapshot_import_id`, scans=368: `CREATE INDEX idx_upseller_stock_snapshot_import_id ON public.upseller_stock_snapshot USING btree (import_id)`; `idx_upseller_stock_snapshot_sku`, scans=2: `CREATE INDEX idx_upseller_stock_snapshot_sku ON public.upseller_stock_snapshot USING btree (sku)`; `upseller_stock_snapshot_import_id_sku_key` [U], scans=184: `CREATE UNIQUE INDEX upseller_stock_snapshot_import_id_sku_key ON public.upseller_stock_snapshot USING btree (import_id, sku)`; `upseller_stock_snapshot_pkey` [PK], scans=0: `CREATE UNIQUE INDEX upseller_stock_snapshot_pkey ON public.upseller_stock_snapshot USING btree (id)`

#### `private`

- `private.shopee_app_secrets` — `shopee_app_secrets_pkey` [PK], scans=2: `CREATE UNIQUE INDEX shopee_app_secrets_pkey ON private.shopee_app_secrets USING btree (app_id)`
- `private.shopee_authorization_tokens` — `shopee_authorization_tokens_access_token_secret_id_key` [U], scans=0: `CREATE UNIQUE INDEX shopee_authorization_tokens_access_token_secret_id_key ON private.shopee_authorization_tokens USING btree (access_token_secret_id)`; `shopee_authorization_tokens_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_authorization_tokens_pkey ON private.shopee_authorization_tokens USING btree (authorization_id)`; `shopee_authorization_tokens_refresh_token_secret_id_key` [U], scans=0: `CREATE UNIQUE INDEX shopee_authorization_tokens_refresh_token_secret_id_key ON private.shopee_authorization_tokens USING btree (refresh_token_secret_id)`
- `private.shopee_oauth_start_tokens` — `shopee_oauth_start_tokens_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_oauth_start_tokens_pkey ON private.shopee_oauth_start_tokens USING btree (token)`
- `private.shopee_oauth_states` — `idx_shopee_oauth_states_expires_at`, scans=1: `CREATE INDEX idx_shopee_oauth_states_expires_at ON private.shopee_oauth_states USING btree (expires_at)`; `idx_shopee_oauth_states_user_app`, scans=0: `CREATE INDEX idx_shopee_oauth_states_user_app ON private.shopee_oauth_states USING btree (user_id, app_id)`; `shopee_oauth_states_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_oauth_states_pkey ON private.shopee_oauth_states USING btree (state)`
- `private.shopee_oauth_states_v3` — `shopee_oauth_states_v3_expiry_idx`, scans=0: `CREATE INDEX shopee_oauth_states_v3_expiry_idx ON private.shopee_oauth_states_v3 USING btree (expires_at) WHERE (status = 'pending'::text)`; `shopee_oauth_states_v3_pkey` [PK], scans=0: `CREATE UNIQUE INDEX shopee_oauth_states_v3_pkey ON private.shopee_oauth_states_v3 USING btree (state_hash)`

#### `ops`

- `ops.sync_log_retention_runs` — `sync_log_retention_runs_pkey` [PK], scans=0: `CREATE UNIQUE INDEX sync_log_retention_runs_pkey ON ops.sync_log_retention_runs USING btree (id)`
- `ops.table_lifecycle_review` — `table_lifecycle_review_pkey` [PK], scans=71: `CREATE UNIQUE INDEX table_lifecycle_review_pkey ON ops.table_lifecycle_review USING btree (table_schema, table_name)`

Scans são cumulativos desde o último reset de stats, cuja data não foi verificada; zero não prova desuso.

### 14.7 Policies RLS — inventário completo

| Tabela | Policy | Roles/cmd | USING | WITH CHECK |
|---|---|---|---|---|
| `public.account_members` | account_members_self_select_v3 | `{authenticated} SELECT` | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| `public.accounts` | accounts_member_select_v3 | `{authenticated} SELECT` | `(EXISTS ( SELECT 1 FROM account_members member WHERE ((member.account_id = accounts.id) AND (member.user_id = ( SELECT auth.uid() AS uid)))))` | `—` |
| `public.ads_cost_overrides` | ads_cost_overrides_owner_all | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.cash_flow_projection` | Permitir leitura anonima cash_flow_projection | `{anon} SELECT` | `true` | `—` |
| `public.cash_flow_projection` | Policy_User_Access_cash_flow_projection | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.cash_flow_projection` | p_cash_flow_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.commerce_fee_settings` | commerce_fee_settings_owner_all | `{public} ALL` | `((user_id IS NULL) OR (user_id = auth.uid()))` | `((user_id IS NULL) OR (user_id = auth.uid()))` |
| `public.inventory_links` | Permitir leitura anonima inventory_links | `{anon} SELECT` | `true` | `—` |
| `public.inventory_links` | p_inventory_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.landed_cost_entries` | Permitir leitura anonima landed_cost_entries | `{anon} SELECT` | `true` | `—` |
| `public.landed_cost_entries` | Policy_User_Access_landed_cost_entries | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.landed_cost_entries` | p_landed_cost_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.product_cost_overrides` | product_cost_overrides_owner_all | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.shopee_account_health` | Policy_User_Access_shopee_account_health | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_ads_balance` | Permitir leitura anonima shopee_ads_balance | `{anon} SELECT` | `true` | `—` |
| `public.shopee_ads_balance` | Policy_User_Access_shopee_ads_balance | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_ads_balance` | p_ads_balance_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.shopee_ads_daily_performance` | Permitir leitura anonima shopee_ads_daily_performance | `{anon} SELECT` | `true` | `—` |
| `public.shopee_ads_daily_performance` | Policy_User_Access_shopee_ads_daily_performance | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_ads_daily_performance` | p_ads_daily_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.shopee_ads_import_batches` | shopee_ads_import_batches_member_select_v3 | `{authenticated} SELECT` | `(EXISTS ( SELECT 1 FROM account_members member WHERE ((member.account_id = shopee_ads_import_batches.account_id) AND (member.user_id = ( SELECT auth.uid() AS uid)))))` | `—` |
| `public.shopee_ads_manual_daily` | shopee_ads_manual_daily_member_select_v3 | `{authenticated} SELECT` | `(EXISTS ( SELECT 1 FROM account_members member WHERE ((member.account_id = shopee_ads_manual_daily.account_id) AND (member.user_id = ( SELECT auth.uid() AS uid)))))` | `—` |
| `public.shopee_ads_product_campaign_daily` | ads_product_campaign_daily_owner_select | `{public} SELECT` | `((user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM shopee_shops s WHERE ((s.shop_id = shopee_ads_product_campaign_daily.shop_id) AND (s.user_id = auth.uid())))))` | `—` |
| `public.shopee_ads_product_campaigns` | ads_product_campaigns_owner_select | `{public} SELECT` | `((user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM shopee_shops s WHERE ((s.shop_id = shopee_ads_product_campaigns.shop_id) AND (s.user_id = auth.uid())))))` | `—` |
| `public.shopee_apps` | shopee_apps_owner_delete | `{authenticated} DELETE` | `(( SELECT auth.uid() AS uid) = user_id)` | `—` |
| `public.shopee_apps` | shopee_apps_owner_insert | `{authenticated} INSERT` | `—` | `(( SELECT auth.uid() AS uid) = user_id)` |
| `public.shopee_apps` | shopee_apps_owner_select | `{authenticated} SELECT` | `(( SELECT auth.uid() AS uid) = user_id)` | `—` |
| `public.shopee_apps` | shopee_apps_owner_update | `{authenticated} UPDATE` | `(( SELECT auth.uid() AS uid) = user_id)` | `(( SELECT auth.uid() AS uid) = user_id)` |
| `public.shopee_authorizations` | shopee_authorizations_member_select_v3 | `{authenticated} SELECT` | `(EXISTS ( SELECT 1 FROM account_members member WHERE ((member.account_id = shopee_authorizations.account_id) AND (member.user_id = ( SELECT auth.uid() AS uid)))))` | `—` |
| `public.shopee_connections` | shopee_connections_member_select_v3 | `{authenticated} SELECT` | `(EXISTS ( SELECT 1 FROM account_members member WHERE ((member.account_id = shopee_connections.account_id) AND (member.user_id = ( SELECT auth.uid() AS uid)))))` | `—` |
| `public.shopee_escrow` | Permitir leitura anonima shopee_escrow | `{anon} SELECT` | `true` | `—` |
| `public.shopee_escrow` | Policy_User_Access_shopee_escrow | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_escrow` | p_escrow_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.shopee_income_overview_snapshots` | Permitir leitura anonima shopee_income_overview_snapshots | `{anon} SELECT` | `true` | `—` |
| `public.shopee_income_overview_snapshots` | Policy_User_Access_shopee_income_overview_snapshots | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_logistics_events` | Policy_User_Access_shopee_logistics_events | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_logistics_tracking` | Policy_User_Access_shopee_logistics_tracking | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_order_items` | Permitir leitura anonima shopee_order_items | `{anon} SELECT` | `true` | `—` |
| `public.shopee_order_items` | Policy_User_Access_shopee_order_items | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_order_items` | p_order_items_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.shopee_orders` | Permitir leitura anonima shopee_orders | `{anon} SELECT` | `true` | `—` |
| `public.shopee_orders` | Policy_User_Access_shopee_orders | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_orders` | p_orders_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.shopee_products` | Permitir leitura anonima shopee_products | `{anon} SELECT` | `true` | `—` |
| `public.shopee_products` | Policy_User_Access_shopee_products | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_products` | p_products_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.shopee_returns` | Permitir leitura anonima shopee_returns | `{anon} SELECT` | `true` | `—` |
| `public.shopee_returns` | Policy_User_Access_shopee_returns | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_returns` | p_returns_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.shopee_reviews` | Policy_User_Access_shopee_reviews | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_shops` | Permitir tudo aos donos das lojas | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.shopee_variations` | Permitir leitura anonima shopee_variations | `{anon} SELECT` | `true` | `—` |
| `public.shopee_variations` | Policy_User_Access_shopee_variations | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_variations` | p_variations_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.shopee_vouchers` | Policy_User_Access_shopee_vouchers | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_wallet_transactions` | Permitir leitura anonima shopee_wallet_transactions | `{anon} SELECT` | `true` | `—` |
| `public.shopee_wallet_transactions` | Policy_User_Access_shopee_wallet_transactions | `{public} ALL` | `(shop_id IN ( SELECT shopee_shops.shop_id FROM shopee_shops WHERE (shopee_shops.user_id = auth.uid())))` | `—` |
| `public.shopee_wallet_transactions` | p_wallet_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.suppliers` | Permitir leitura anonima suppliers | `{anon} SELECT` | `true` | `—` |
| `public.suppliers` | Policy_User_Access_suppliers | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.suppliers` | p_suppliers_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.sync_log` | Permitir leitura anonima sync_log | `{anon} SELECT` | `true` | `—` |
| `public.sync_log` | Policy_User_Access_sync_log | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.sync_log` | p_sync_log_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.sync_log` | p_sync_log_service_only | `{service_role} ALL` | `true` | `true` |
| `public.sync_state` | Permitir leitura anonima sync_state | `{anon} SELECT` | `true` | `—` |
| `public.sync_state` | Permitir tudo dono sync_state | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.sync_state` | p_sync_state_service_only | `{service_role} ALL` | `true` | `true` |
| `public.tiktok_orders` | Permitir leitura anonima tiktok_orders | `{anon} SELECT` | `true` | `—` |
| `public.tiktok_orders` | p_tiktok_orders_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.upseller_catalog_imports` | Permitir leitura anonima upseller_catalog_imports | `{anon} SELECT` | `true` | `—` |
| `public.upseller_catalog_imports` | Policy_User_Access_upseller_catalog_imports | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.upseller_kit_snapshot` | Permitir leitura anonima upseller_kit_snapshot | `{anon} SELECT` | `true` | `—` |
| `public.upseller_kit_snapshot` | Policy_User_Access_upseller_kit_snapshot | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.upseller_product_snapshot` | Permitir leitura anonima upseller_product_snapshot | `{anon} SELECT` | `true` | `—` |
| `public.upseller_product_snapshot` | Policy_User_Access_upseller_product_snapshot | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.upseller_stock_imports` | Permitir leitura anonima upseller_stock_imports | `{anon} SELECT` | `true` | `—` |
| `public.upseller_stock_imports` | Policy_User_Access_upseller_stock_imports | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.upseller_stock_imports` | p_upseller_stock_imports_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.upseller_stock_settings` | Permitir leitura anonima upseller_stock_settings | `{anon} SELECT` | `true` | `—` |
| `public.upseller_stock_settings` | Policy_User_Access_upseller_stock_settings | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.upseller_stock_settings` | p_upseller_stock_settings_select_authenticated | `{authenticated} SELECT` | `true` | `—` |
| `public.upseller_stock_snapshot` | Permitir leitura anonima upseller_stock_snapshot | `{anon} SELECT` | `true` | `—` |
| `public.upseller_stock_snapshot` | Policy_User_Access_upseller_stock_snapshot | `{public} ALL` | `(user_id = auth.uid())` | `(user_id = auth.uid())` |
| `public.upseller_stock_snapshot` | p_upseller_stock_snapshot_select_authenticated | `{authenticated} SELECT` | `true` | `—` |

Tabelas RLS sem policy: `public.shopee_app_secrets`, `public.shopee_oauth_start_tokens`, `public.shopee_oauth_states`, `public.sync_cursors`, `public.sync_runs` e as cinco tabelas `private`. Para `private`/secrets isso funciona como default-deny; não deve ser “corrigido” com policy ampla.

### 14.8 Grants de cliente, agrupados

| Schema/role | Privilégios | Objetos |
|---|---|---|
| `private.service_role` | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE | shopee_app_secrets, shopee_authorization_tokens, shopee_oauth_start_tokens, shopee_oauth_states, shopee_oauth_states_v3 |
| `public.anon` | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE | account_members, accounts, ads_cost_overrides, cash_flow_projection, commerce_fee_settings, inventory_links, landed_cost_entries, product_cost_overrides, shopee_account_health, shopee_ads_balance, shopee_ads_daily, shopee_ads_daily_performance, shopee_ads_product_campaign_daily, shopee_ads_product_campaigns, shopee_apps, shopee_escrow, shopee_income_overview_snapshots, shopee_logistics_events, shopee_logistics_tracking, shopee_order_items, shopee_orders, shopee_products, shopee_returns, shopee_reviews, shopee_shops, shopee_variations, shopee_vouchers, shopee_wallet_transactions, suppliers, sync_cursors, sync_log, sync_runs, sync_state, tiktok_orders, upseller_catalog_imports, upseller_kit_snapshot, upseller_product_snapshot, upseller_stock_imports, upseller_stock_settings, upseller_stock_snapshot, vw_ads_daily, vw_ads_summary, vw_catalog_summary, vw_financial_daily, vw_financial_summary, vw_orders_daily, vw_orders_daily_status, vw_orders_monthly, vw_orders_status_summary, vw_product_ads_daily, vw_product_ads_summary, vw_product_performance_daily, vw_product_performance_summary, vw_product_variation_performance_summary, vw_returns_daily, vw_sales_daily, vw_sales_monthly, vw_sync_health, vw_sync_latest_status, vw_sync_state_dashboard, vw_top_products, vw_upseller_catalog_latest_import, vw_upseller_kit_components_latest, vw_upseller_products_latest, vw_upseller_sku_daily_demand, vw_upseller_stock_latest, vw_upseller_stock_latest_import, vw_upseller_stock_planning, vw_upseller_stock_summary, vw_wallet_balance_latest, vw_wallet_daily |
| `public.anon` | REFERENCES,SELECT,TRIGGER,TRUNCATE | shopee_ads_import_batches, shopee_ads_manual_daily, shopee_authorizations, shopee_connections |
| `public.anon` | SELECT | app_public_health |
| `public.authenticated` | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE | account_members, accounts, ads_cost_overrides, cash_flow_projection, commerce_fee_settings, inventory_links, landed_cost_entries, product_cost_overrides, shopee_account_health, shopee_ads_balance, shopee_ads_daily, shopee_ads_daily_performance, shopee_ads_product_campaign_daily, shopee_ads_product_campaigns, shopee_apps, shopee_escrow, shopee_income_overview_snapshots, shopee_logistics_events, shopee_logistics_tracking, shopee_order_items, shopee_orders, shopee_products, shopee_returns, shopee_reviews, shopee_shops, shopee_variations, shopee_vouchers, shopee_wallet_transactions, suppliers, sync_cursors, sync_log, sync_runs, sync_state, tiktok_orders, upseller_catalog_imports, upseller_kit_snapshot, upseller_product_snapshot, upseller_stock_imports, upseller_stock_settings, upseller_stock_snapshot, vw_ads_daily, vw_ads_summary, vw_catalog_summary, vw_financial_daily, vw_financial_summary, vw_orders_daily, vw_orders_daily_status, vw_orders_monthly, vw_orders_status_summary, vw_product_ads_daily, vw_product_ads_summary, vw_product_performance_daily, vw_product_performance_summary, vw_product_variation_performance_summary, vw_returns_daily, vw_sales_daily, vw_sales_monthly, vw_sync_health, vw_sync_latest_status, vw_sync_state_dashboard, vw_top_products, vw_upseller_catalog_latest_import, vw_upseller_kit_components_latest, vw_upseller_products_latest, vw_upseller_sku_daily_demand, vw_upseller_stock_latest, vw_upseller_stock_latest_import, vw_upseller_stock_planning, vw_upseller_stock_summary, vw_wallet_balance_latest, vw_wallet_daily |
| `public.authenticated` | REFERENCES,SELECT,TRIGGER,TRUNCATE | shopee_ads_import_batches, shopee_ads_manual_daily, shopee_authorizations, shopee_connections |
| `public.authenticated` | SELECT | app_public_health |
| `public.service_role` | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE | account_members, accounts, ads_cost_overrides, app_public_health, cash_flow_projection, commerce_fee_settings, inventory_links, landed_cost_entries, product_cost_overrides, shopee_account_health, shopee_ads_balance, shopee_ads_daily, shopee_ads_daily_performance, shopee_ads_import_batches, shopee_ads_manual_daily, shopee_ads_product_campaign_daily, shopee_ads_product_campaigns, shopee_app_secrets, shopee_apps, shopee_authorizations, shopee_connections, shopee_escrow, shopee_income_overview_snapshots, shopee_logistics_events, shopee_logistics_tracking, shopee_oauth_start_tokens, shopee_oauth_states, shopee_order_items, shopee_orders, shopee_products, shopee_returns, shopee_reviews, shopee_shops, shopee_variations, shopee_vouchers, shopee_wallet_transactions, suppliers, sync_cursors, sync_log, sync_runs, sync_state, tiktok_orders, upseller_catalog_imports, upseller_kit_snapshot, upseller_product_snapshot, upseller_stock_imports, upseller_stock_settings, upseller_stock_snapshot, vw_ads_daily, vw_ads_summary, vw_catalog_summary, vw_financial_daily, vw_financial_summary, vw_orders_daily, vw_orders_daily_status, vw_orders_monthly, vw_orders_status_summary, vw_product_ads_daily, vw_product_ads_summary, vw_product_performance_daily, vw_product_performance_summary, vw_product_variation_performance_summary, vw_returns_daily, vw_sales_daily, vw_sales_monthly, vw_sync_health, vw_sync_latest_status, vw_sync_state_dashboard, vw_top_products, vw_upseller_catalog_latest_import, vw_upseller_kit_components_latest, vw_upseller_products_latest, vw_upseller_sku_daily_demand, vw_upseller_stock_latest, vw_upseller_stock_latest_import, vw_upseller_stock_planning, vw_upseller_stock_summary, vw_wallet_balance_latest, vw_wallet_daily |

Grants de owners/admins gerenciados não foram expandidos porque repetem ACLs de infraestrutura. Schema USAGE: `public` para PUBLIC/anon/authenticated; `private` para service_role; `ops` somente postgres.

### 14.9 Funções SQL e triggers

| Função | Segurança | ACL | Hash definição | Flags |
|---|---|---|---|---|
| `ops.prune_sync_log(p_retention_days integer, p_keep_min_rows integer)` | DEFINER; search_path=public, ops | `{=X/postgres,postgres=X/postgres}` | `ed9bd009e8b065cb2cee792b87e5693c` | auth.uid=false; vault=false; user_metadata=false |
| `public.check_user_shop_limit()` | INVOKER; search_path=public, pg_temp | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `222fad28c45b984db3c363ec47e40898` | auth.uid=false; vault=false; user_metadata=false |
| `public.claim_shopee_oauth_state_v3(p_state_hash text)` | DEFINER; search_path="" | `{postgres=X/postgres,service_role=X/postgres}` | `25dc532e19d15dd1cf821640f3274b71` | auth.uid=false; vault=false; user_metadata=false |
| `public.commit_shopee_ads_manual_v1(p_batch_id uuid, p_rows jsonb)` | DEFINER; search_path="" | `{postgres=X/postgres,service_role=X/postgres}` | `55bd479b3d38e7997a2333ba44bba492` | auth.uid=false; vault=false; user_metadata=false |
| `public.create_shopee_oauth_state_v3(p_state_hash text, p_user_id uuid, p_account_id uuid, p_return_path text, p_expires_at timestamp with time zone)` | DEFINER; search_path="" | `{postgres=X/postgres,service_role=X/postgres}` | `6ee3f9044ce05901b64904dced21fa3c` | auth.uid=false; vault=false; user_metadata=false |
| `public.fail_shopee_oauth_state_v3(p_state_hash text, p_error_code text)` | DEFINER; search_path="" | `{postgres=X/postgres,service_role=X/postgres}` | `2769f84b53db4e3e611dff8eca0e0e36` | auth.uid=false; vault=false; user_metadata=false |
| `public.finalize_shopee_oauth_v3(p_state_hash text, p_partner_id bigint, p_access_token text, p_refresh_token text, p_access_expires_at timestamp with time zone, p_refresh_expires_at timestamp with time zone, p_shop_ids bigint[])` | DEFINER; search_path="" | `{postgres=X/postgres,service_role=X/postgres}` | `48251f01242375ccb4c5d4fc4bdca336` | auth.uid=false; vault=true; user_metadata=false |
| `public.get_shopee_authorization_tokens_v3(p_authorization_id uuid)` | DEFINER; search_path="" | `{postgres=X/postgres,service_role=X/postgres}` | `d6fec99ce2467d1e5c4d641a61ca28e7` | auth.uid=false; vault=true; user_metadata=false |
| `public.revoke_shopee_connection_v3(p_connection_id uuid)` | DEFINER; search_path="" | `{postgres=X/postgres,service_role=X/postgres}` | `6d79a738bf4264e25788eac2c44fc330` | auth.uid=false; vault=true; user_metadata=false |
| `public.rls_auto_enable()` | DEFINER; search_path=pg_catalog | `{postgres=X/postgres,service_role=X/postgres}` | `6998ea6b4c2480f5d2e34b5dcf3f8d36` | auth.uid=false; vault=false; user_metadata=false |
| `public.rotate_shopee_authorization_tokens_v3(p_authorization_id uuid, p_access_token text, p_refresh_token text, p_access_expires_at timestamp with time zone, p_refresh_expires_at timestamp with time zone)` | DEFINER; search_path="" | `{postgres=X/postgres,service_role=X/postgres}` | `36cdd32ca48344aec441325b2a0a1067` | auth.uid=false; vault=true; user_metadata=false |
| `public.sync_shopee_app_secret_by_account()` | INVOKER; search_path=public, pg_temp | `{postgres=X/postgres,service_role=X/postgres}` | `749ae6fcd529a99d75eac484fe8c2604` | auth.uid=false; vault=false; user_metadata=false |
| `public.sync_shopee_shop_tokens_by_account()` | INVOKER; search_path=public, pg_temp | `{postgres=X/postgres,service_role=X/postgres}` | `dd2292bd1df8ac582d4a902d557cd620` | auth.uid=false; vault=false; user_metadata=false |

| Trigger | Definição |
|---|---|
| `public.shopee_app_secrets.trg_sync_shopee_app_secret_by_account` | `CREATE TRIGGER trg_sync_shopee_app_secret_by_account AFTER INSERT OR UPDATE OF partner_key ON shopee_app_secrets FOR EACH ROW EXECUTE FUNCTION sync_shopee_app_secret_by_account()` |
| `public.shopee_shops.trg_sync_shopee_shop_tokens_by_account` | `CREATE TRIGGER trg_sync_shopee_shop_tokens_by_account AFTER INSERT OR UPDATE OF access_token, refresh_token, token_expire_in, auth_expires_at ON shopee_shops FOR EACH ROW EXECUTE FUNCTION sync_shopee_shop_tokens_by_account()` |
| `public.shopee_shops.trigger_check_shop_limit` | `CREATE TRIGGER trigger_check_shop_limit BEFORE INSERT ON shopee_shops FOR EACH ROW EXECUTE FUNCTION check_user_shop_limit()` |

### 14.10 Queries somente leitura executadas

Os grupos abaixo foram executados via interface administrativa somente leitura; comandos completos contendo cron foram sanitizados antes de registrar evidência:

- `pg_namespace/pg_class/pg_attribute`: schemas, relações, tipos, RLS, tamanho e colunas.
- `pg_constraint/pg_index/pg_stat_user_*`: PK/FK/checks, índices, scans, tuples e manutenção.
- `pg_policies/information_schema.role_table_grants/aclexplode`: policies, grants de tabela e schema.
- `pg_proc/pg_trigger/pg_rewrite/pg_depend`: funções, ACL/hash/flags, triggers e dependências de views.
- `pg_publication*`: publication Realtime.
- `cron.job` e `cron.job_run_details`: nomes, agenda, destino classificado, hash do comando e saúde; headers/valores omitidos.
- agregações de `count/min/max/null/distinct/not exists`: volume, frescor, nulos, duplicidades, órfãos e consistência tenant; nenhum valor de linha.
- agregados de `auth`, `storage`, Vault refs, OAuth TTL e `ops.sync_freshness`; nenhum email, IP, token, secret, payload ou conteúdo comercial.

### 14.11 Limitações

- Logs Supabase são amostras limitadas (Edge/API/Postgres: 100 entradas; Auth: 47) e não provam ausência histórica.
- O `HEAD` anônimo confirmou alcance de `shopee_orders`; os demais 22 objetos foram confirmados por grants + policy, sem chamadas adicionais que pudessem ampliar exposição.
- Configurações Auth não expostas pelas ferramentas (JWT TTL, CAPTCHA, SMTP, redirects, signing keys) são `Não verificável`.
- Não foram lidos valores de Supabase secrets, Netlify env vars, Vault, tokens, partner keys nem comandos cron completos.
- Staging foi comparado só em metadados; contagens/dados de staging não integram conclusões.
- Estatísticas de uso podem ter sido resetadas; índices sem scan e objetos sem caller textual não são prova de desuso.
- O deploy Netlify não possui commit ref; equivalência exata com qualquer commit é não verificável. Vários assets coincidem com o HEAD da branch local, mas `index.html`, `supabase-auth-sync-v2.js` e `shopee-third-party-app.js` não são integralmente reconstruíveis por esse HEAD.

### 14.12 Critérios de aceitação verificados

- Todos os 46 tables/33 views públicos, 5 tables privados, 2 tables/4 views ops aparecem no inventário; schemas gerenciados têm exclusão justificada.
- As 8 Edge Functions de produção foram reconciliadas com staging, frontend publicado e checkout.
- Os nove domínios do roteiro foram classificados.
- O relatório não contém chaves, tokens, emails, valores de IDs de usuário/loja, registros pessoais/comerciais ou comandos destrutivos.
- Toda descontinuação exige validação humana; nenhuma ação de `DROP` é proposta para execução.



## Base normativa oficial (Supabase, verificada em 2026-07-16)

### Escopo, precedência e limites desta base

Esta seção fixa os critérios normativos usados para interpretar a evidência técnica da auditoria. A consulta foi feita em 2026-07-16, exclusivamente em documentação e changelog oficiais do Supabase e, para a semântica de privilégios do PostgreSQL, na documentação oficial do PostgreSQL. As páginas de documentação são vivas e, em geral, não exibem data de revisão; por isso, a data acima é a data de consulta, enquanto datas de publicação ou edição abaixo só são afirmadas quando a própria fonte as informa. O [índice oficial de breaking changes](https://supabase.com/changelog?tags=breaking-change) foi revisado antes das páginas temáticas.

Estes critérios não provam, por si, o estado de nenhum projeto. A aplicabilidade de cada regra depende da versão real do PostgreSQL e das extensões, dos schemas expostos, dos grants, das opções de Auth, das versões dos clientes e da configuração implantada de cada Edge Function. Nenhum secret, token, payload pessoal ou dado comercial foi consultado para compor esta seção.

### Mudanças de plataforma que alteram a leitura da auditoria

| Data da fonte | Mudança oficial | Consequência para a auditoria |
|---|---|---|
| 2026-04-28 | [Novas tabelas deixam de ser expostas automaticamente à Data API e GraphQL](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically). O novo padrão começou para projetos novos em 2026-05-30 e está anunciado para projetos existentes em 2026-10-30; objetos já existentes conservam seus grants. | Não inferir exposição apenas porque a tabela está em `public`, nem inferir privacidade apenas porque não há policy. Inventariar grants efetivos separadamente de RLS e exigir grants explícitos nas migrations para novos objetos. A data de 2026-10-30 ainda era futura na data desta consulta. |
| 2026-02-17 | [O schema OpenAPI no caminho raiz da Data API deixou de ser acessível com chave `anon`](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key); o cronograma publicado encerrou o acesso para projetos existentes em 2026-04-08. Operações normais em `/rest/v1/<objeto>` não foram afetadas. | Falha ao enumerar o OpenAPI com chave pública não demonstra que tabelas ou RPCs estejam inacessíveis. A enumeração de catálogo deve usar evidência administrativa somente leitura, sem colocar chave secreta no cliente. |
| 2024-09-12, com atualização em 2025 | [Introdução das chaves publicáveis e secretas](https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys). A documentação atual informa depreciação das chaves JWT legadas até o fim de 2026. | Distinguir chave de aplicação de JWT de usuário. `sb_publishable_...` e `sb_secret_...` não são JWTs; a primeira é pública e depende de grants/RLS, enquanto a segunda é somente backend e usa privilégios elevados. A data final exata de retirada das chaves legadas ainda não estava fixada no changelog. |
| 2026-01-26 e 2026-05-25 | [`pg_graphql` deixou de ser habilitado automaticamente](https://supabase.com/changelog/42180-breaking-change-pg-graphql-no-longer-enabled-automatically-within-approx-3-weeks) e, no `pg_graphql` 1.6.0, [introspection passou a vir desabilitada por padrão](https://supabase.com/changelog/46320-breaking-change-in-pg-graphql-1-6-0-graphql-introspection-disabled-by-default) para novos projetos a partir de 2026-06-29. | Ausência de introspection não prova ausência da API GraphQL. Confirmar versão, extensão, uso e configuração; se GraphQL não for necessário, manter a superfície desabilitada é coerente com o padrão de menor exposição. |
| 2023-11-29 | [Alterações diretas em `cron.job` deixaram de ser permitidas](https://supabase.com/changelog/19298-directly-updating-rows-in-the-cron-job-table-is-no-longer-allowed), pois contornavam verificações do `pg_cron`. | Tratar `cron.job` como catálogo somente leitura e administrar jobs por `cron.schedule`, `cron.alter_job` e `cron.unschedule`, nunca por DML direto. |
| 2026-03-11 | [Chamadas recursivas ou encadeadas entre Edge Functions passaram a ter limite por cadeia](https://supabase.com/changelog/43644-edge-functions-rate-limits-on-recursive-nested-edge-functions-calls), com orçamento mínimo documentado de 5.000 chamadas/minuto. | Mapear fan-out, ciclos e chamadas função→função. Tratar `RateLimitError.retryAfterMs`, reduzir fan-out e exigir idempotência antes de qualquer retry. |
| 2026-04-20 | [Clientes oficiais passaram a repetir automaticamente consultas PostgREST idempotentes](https://supabase.com/changelog/45071-automatic-postgrest-retries-for-transient-errors): somente `GET`/`HEAD`, até três tentativas, com backoff; mutações não são repetidas automaticamente. | Não atribuir duplicidade de escrita a esse mecanismo. Ainda assim, produtores, webhooks, cron e retries implementados pela aplicação precisam de chave de idempotência ou restrição única adequada. |

As breaking changes de maio de 2026 sobre a imagem self-hosted e a migração do PostgreSQL 15 para 17 foram examinadas, mas não são norma direta para um projeto hospedado na plataforma. Só se tornam aplicáveis a uma instalação self-hosted ou como contexto de compatibilidade; a versão efetiva do banco continua sendo a evidência decisiva.

### Data API, grants, RLS e isolamento de tenants

A Data API tem duas barreiras independentes: grants determinam se `anon`, `authenticated` ou `service_role` alcançam o objeto; policies RLS determinam quais linhas ficam disponíveis depois disso. O baseline oficial é conceder apenas as operações necessárias, habilitar RLS em toda tabela de schema exposto e versionar grant, `ENABLE ROW LEVEL SECURITY` e policies juntos. Uma tabela com grant e sem RLS pode ser integralmente acessível pelo papel contemplado. Se a aplicação não usa REST, GraphQL nem clientes Supabase para dados, a própria documentação recomenda considerar desabilitar a Data API; outra opção é expor um schema `api` dedicado e manter tabelas e helpers internos fora dele. Fonte: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

Para isolamento multi-tenant, `TO authenticated` autentica o papel, mas não limita a linha ao usuário, conta ou loja. Cada operação deve ter predicado verificável de posse ou associação (`user_id`, `account_id`, `shop_id` ou relação equivalente), e políticas de `UPDATE` devem controlar tanto a linha existente (`USING`) quanto o resultado (`WITH CHECK`). `UPDATE` também requer uma policy de `SELECT`. Usuários anônimos criados pelo Supabase Auth assumem o papel PostgreSQL `authenticated`; quando essa distinção importar, deve-se validar a claim `is_anonymous`. Fonte: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

Dados de autorização não devem depender de `raw_user_meta_data`/`user_metadata`, pois o usuário autenticado pode alterá-los. `raw_app_meta_data`/`app_metadata` é o local apropriado entre essas duas opções, mas claims contidas no JWT permanecem antigas até a renovação do token. Por isso, mudanças urgentes de acesso não podem depender apenas de uma claim ainda não atualizada. Fonte: [helpers de RLS e `auth.jwt()`](https://supabase.com/docs/guides/database/postgres/row-level-security#helper-functions).

Views normalmente executam com os privilégios do proprietário e podem contornar as policies das tabelas subjacentes. Em PostgreSQL 15 ou superior, views acessíveis a clientes devem usar `security_invoker = true` para obedecer ao contexto RLS do chamador. Em versões anteriores, a orientação oficial é revogar acesso de `anon`/`authenticated` ou mover a view para schema não exposto. A versão do PostgreSQL e a opção real de cada view devem ser verificadas; o nome da view não é evidência suficiente. Fonte: [RLS em views](https://supabase.com/docs/guides/database/postgres/row-level-security#views).

### Funções SQL e privilégios elevados

`SECURITY INVOKER` é o padrão recomendado. Uma função `SECURITY DEFINER` executa como seu proprietário e, se esse proprietário for dono da tabela, superusuário ou tiver `BYPASSRLS`, pode ultrapassar as barreiras esperadas pelo chamador. Toda função desse tipo deve ter justificativa, proprietário conhecido, `search_path` fixo e seguro, referências qualificadas por schema e grants mínimos. A orientação do Supabase é não colocar helpers `SECURITY DEFINER` em schemas expostos; a orientação do PostgreSQL é excluir schemas graváveis por usuários não confiáveis do `search_path`. Fontes: [Database Functions](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker), [RLS e funções definer](https://supabase.com/docs/guides/database/postgres/row-level-security#use-security-definer-functions) e [CREATE FUNCTION do PostgreSQL](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

Funções não recebem proteção RLS em sua própria interface RPC; o acesso é controlado por `EXECUTE` e pela lógica interna. PostgreSQL concede `EXECUTE` em novas funções a `PUBLIC` por padrão, e `PUBLIC` abrange todos os papéis. Assim, a auditoria deve conferir assinatura completa, owner, ACL e default privileges, revogar `PUBLIC`/`anon`/`authenticated` quando não forem necessários e conceder execução seletivamente. Fontes: [Function privileges](https://supabase.com/docs/guides/database/functions#function-privileges) e [privilégios padrão do PostgreSQL](https://www.postgresql.org/docs/current/ddl-priv.html).

### Auth, sessões, JWT e chaves

Uma sessão Supabase combina access token JWT e refresh token. Por padrão, sessões podem durar indefinidamente e coexistir em vários dispositivos; access tokens são curtos (tipicamente 5 minutos a 1 hora, com 1 hora como recomendação geral) e refresh tokens são de uso único, com intervalo de reutilização padrão de 10 segundos para tolerar condições legítimas. Limites de duração, inatividade e sessão única só produzem efeito conforme o token é renovado. Fonte: [User sessions](https://supabase.com/docs/guides/auth/sessions).

Sign-out revoga refresh tokens, mas o access token já emitido continua válido até `exp`; excluir `auth.users` também não encerra automaticamente o JWT. Para ações excepcionalmente sensíveis que exigem revogação imediata, a orientação oficial é conferir se a claim `session_id` ainda corresponde a uma linha em `auth.sessions`, limitando esse custo às operações que realmente precisam da garantia. Fontes: [Signing out](https://supabase.com/docs/guides/auth/signout), [Deleting users](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users) e [User sessions](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out).

O sistema novo de signing keys assimétricas é recomendado em relação ao segredo JWT legado e permite verificação local via JWKS e rotação sem indisponibilidade. O endpoint JWKS público contém somente chaves públicas; a documentação alerta para cache de 10 minutos na borda e recomenda aguardar ao menos 20 minutos em transições de chave. A aplicação deve usar `supabase.auth.getClaims()` ou biblioteca JWT reconhecida, validar `iss`, `exp`, assinatura e demais claims pertinentes e não implementar criptografia manualmente. Fontes: [JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys) e [JSON Web Tokens](https://supabase.com/docs/guides/auth/jwts).

Chaves publicáveis/`anon` identificam o componente público e não substituem autorização por usuário. Chaves secretas/`service_role` são exclusivamente de backend e ignoram RLS. Não devem aparecer em bundle, repositório, URL, query string, resposta, log ou browser. A documentação recomenda uma chave secreta distinta por componente; se for indispensável registrar sua identidade, usar hash SHA-256, ou no máximo até seis caracteres não sensíveis para diagnóstico. Fonte: [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys).

### Advisors de segurança e performance

Os Advisors rodam automaticamente no Dashboard e podem ser reexecutados. Na data da consulta, os checks oficiais incluíam, entre outros: FK sem índice, `auth.users` exposta, chamada Auth em RLS sem `initPlan`, ausência de PK, índice sem uso ou duplicado, policies permissivas múltiplas, policy com RLS desabilitado, RLS sem policy, view security-definer, `search_path` mutável, sign-in anônimo, RLS desabilitado em `public`, extensão em `public`, RLS baseada em user metadata, materialized view ou foreign table em schema de API, bloat, colunas sensíveis expostas e função `SECURITY DEFINER` executável por `anon` ou `authenticated`. Fonte e catálogo atual: [Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors).

Um alerta é evidência de lint, não prova isolada de vulnerabilidade, lentidão ou desuso. Cada item precisa ser reconciliado com grants, owners, policies, chamadores implantados, volume, plano de execução e janela das estatísticas. Em particular, “unused index” sem período de observação representativo não autoriza remoção, e “RLS enabled no policy” pode representar default-deny intencional. O resultado deve ser revalidado depois de qualquer correção proposta.

### Edge Functions: autenticação, secrets, observabilidade e resiliência

As credenciais têm canais distintos: JWT do usuário vai em `Authorization: Bearer ...`; chave publicável ou secreta vai em `apikey`. Com `verify_jwt = true` (padrão), o gateway exige JWT válido antes de executar o handler. Para chamadas autenticadas de usuário, manter essa verificação e propagar o contexto RLS do usuário. Para webhook externo ou chamada serviço→serviço por API key, `verify_jwt` precisa ser desabilitado e o próprio handler deve validar assinatura do provedor ou chave esperada; `auth: none` só é aceitável para endpoint genuinamente público. Portanto, `verify_jwt = false` sem autenticação equivalente no código é um achado de alto risco, não uma configuração neutra. Fontes: [Authorization headers](https://supabase.com/docs/guides/functions/auth-headers) e [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth).

Secrets de produção devem ficar no gerenciador de secrets e ser lidos por variáveis de ambiente; arquivos `.env` não devem ser versionados. `SUPABASE_SECRET_KEYS` e o legado `SUPABASE_SERVICE_ROLE_KEY` concedem contexto administrativo que ignora RLS. A auditoria deve conferir apenas nomes esperados e consumidores, nunca valores. Fonte: [Environment Variables](https://supabase.com/docs/guides/functions/secrets).

Invocações, status, duração, exceptions e logs customizados ficam disponíveis no Dashboard. Logs customizados têm limite de 10.000 caracteres e 100 eventos em 10 segundos. Como headers, cookies, corpos e mensagens de erro podem conter JWT, API key, PII ou dados comerciais, o baseline desta auditoria é redigir esses campos e registrar identificadores técnicos mínimos; a própria orientação de chaves exige sanitização prévia de headers. Fontes: [Edge Function Logging](https://supabase.com/docs/guides/functions/logging), [API keys](https://supabase.com/docs/guides/getting-started/api-keys#what-secret-keys-allow-access-to) e [Logs](https://supabase.com/docs/guides/telemetry/logs).

Funções devem ser curtas e idempotentes, retornar status HTTP coerente, capturar erros assíncronos e impor timeout nas dependências externas. Background tasks também precisam de `try/catch` e permanecem sujeitas a limites de CPU, memória e wall clock. Chamadas aninhadas devem respeitar `retryAfterMs`; retries de escrita só são seguros com idempotency key, upsert/constraint equivalente ou transação que impeça duplicidade. Os limites hospedados atuais incluem 256 MB, 2 s de CPU por request, idle timeout de 150 s e wall clock de 150 s no plano Free ou 400 s nos pagos; esses valores são limites da plataforma na data da consulta, não SLO da aplicação. Fontes: [Error Handling](https://supabase.com/docs/guides/functions/error-handling), [Background Tasks](https://supabase.com/docs/guides/functions/background-tasks), [Recursive Functions](https://supabase.com/docs/guides/functions/recursive-functions) e [Limits](https://supabase.com/docs/guides/functions/limits).

Cada função deve ter configuração de dependências isolada, preferencialmente `deno.json` próprio; import maps são legados. Dependências devem ter versões controladas e lockfiles versionados para reduzir drift e risco de supply chain. Fontes: [Managing dependencies](https://supabase.com/docs/guides/functions/dependencies) e [Securing npm installs](https://supabase.com/docs/guides/security/npm-security#pin-your-dependency-versions).

### Realtime e publicação lógica

Postgres Changes só transmite tabelas incluídas na publication `supabase_realtime`. A inclusão na publication não substitui `SELECT` e RLS para os papéis assinantes. `replica identity full` amplia o registro anterior em updates/deletes, mas, sob RLS, o payload antigo de `DELETE` fica limitado às chaves primárias; logo, publication, replica identity, grants e policies devem ser inventariados em conjunto. Fonte: [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

Para Broadcast e Presence em produção, o baseline oficial é canal privado e RLS em `realtime.messages`, com acesso público desabilitado quando o produto não o exige. A autorização é calculada na entrada do canal a partir das policies, JWT, headers e topic; policies complexas aumentam a latência de join. Fontes: [Getting Started with Realtime](https://supabase.com/docs/guides/realtime/getting_started#essential-best-practices) e [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).

Postgres Changes autoriza cada evento para cada assinante e processa mudanças em uma única thread para preservar ordem; isso pode transformar um evento em muitas leituras de autorização. Para alto volume, a orientação oficial é medir com carga real e considerar Broadcast ou uma camada server-side. Ausência de assinantes observados numa janela curta não basta para remover uma tabela da publication. Fonte: [Realtime Benchmarks](https://supabase.com/docs/guides/realtime/benchmarks#postgres-changes).

### Cron e chamadas agendadas

Supabase Cron usa `pg_cron`; definições ficam em `cron.job` e execuções/status em `cron.job_run_details`. A recomendação publicada é no máximo oito jobs concorrentes e até dez minutos por job. A saúde operacional deve considerar últimas execuções, duração, falhas, sobreposição e consumo de conexões, sem reproduzir argumentos sensíveis. Fonte: [Cron](https://supabase.com/docs/guides/cron).

Chamadas agendadas a Edge Functions normalmente combinam `pg_cron` e `pg_net`. URL e credencial devem ser recuperadas do Vault, não gravadas literalmente no comando do job. Com as chaves novas, API key pertence ao header `apikey`; o modo de autenticação do handler precisa corresponder ao tipo de caller. Durante a auditoria, registrar somente nome do job, periodicidade, destino e mecanismo de autenticação, nunca o valor de Vault ou header. Fontes: [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) e [Securing Edge Functions — service-to-service](https://supabase.com/docs/guides/functions/auth#service-to-service-calls).

Jobs só devem ser alterados pelas funções de `pg_cron`. O guia oficial, editado em 2026-06-19, orienta investigar falhas em `cron.job_run_details`, atividade do scheduler e logs PostgreSQL; informa `pg_cron` 1.6.4 como versão corrente na plataforma, mas a versão efetivamente instalada no projeto continua sendo a evidência válida. Fonte: [pg_cron debugging guide](https://supabase.com/docs/guides/troubleshooting/pgcron-debugging-guide-n1KTaz).

### Índices, planos e evidência de uso

O diagnóstico deve começar por carga real e estatísticas agregadas: Advisors, `pg_stat_statements`, tamanhos, scans sequenciais, cache, locks, bloat e planos. `pg_stat_statements` normaliza consultas e acumula contagens e tempos; a documentação de inspeção alerta que a visão conserva uma janela limitada de statements e pode ter sido resetada. Assim, ausência de chamadas não comprova desuso sem conhecer início/reset e sazonalidade da observação. Fontes: [`pg_stat_statements`](https://supabase.com/docs/guides/database/extensions/pg_stat_statements) e [Debugging and monitoring](https://supabase.com/docs/guides/database/inspect).

Índices devem refletir filtros, joins, ordenação e cardinalidade reais. Isso inclui FKs e colunas usadas em policies RLS, especialmente chaves de tenant. A documentação recomenda encapsular helpers invariantes como `(select auth.uid())` para permitir `initPlan` e repetir no query o filtro de tenant já imposto pela policy, ajudando o planner sem enfraquecer RLS. Fontes: [RLS performance recommendations](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations) e [Query Optimization](https://supabase.com/docs/guides/database/query-optimization).

O `index_advisor` sugere apenas índices B-tree de uma coluna e pode não modelar índices compostos, parciais, GIN, BRIN ou custo de escrita. Toda sugestão deve ser validada com plano e workload representativos; índices aceleram leitura, mas também consomem espaço e encarecem `INSERT`/`UPDATE`/`DELETE`. Fonte: [`index_advisor`](https://supabase.com/docs/guides/database/extensions/index_advisor).

### Regra de interpretação no restante do relatório

Uma divergência em relação a esta base é um achado somente quando confirmada no catálogo implantado, configuração efetiva, código implantado ou logs/estatísticas agregados. Recomendações de remoção exigem convergência de banco, Edge Functions, frontend publicado, código versionado/local, dependências, publication/cron e janela operacional representativa. Advisor, falta de referência textual ou contador zero isolado nunca autoriza `DROP`; qualquer descontinuação exige validação humana, backup/rollback e observação após retirada de tráfego.
