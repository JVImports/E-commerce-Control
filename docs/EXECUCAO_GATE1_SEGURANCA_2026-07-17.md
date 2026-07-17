# Execução do Gate 1 de segurança

Data: 17/07/2026
Escopo: contenção da Data API do Supabase antes da criação e autorização do app Third-party da Shopee.

## Resultado

A migration `20260717135438_close_public_data_api_exposure.sql` foi aplicada com sucesso no projeto de staging `zgfehhqfodhspklbwhgc` e, após validação, no projeto de produção `qzcxukcwvjnhbnwpjceg`.

Controles implantados:

- RLS habilitado nas tabelas públicas;
- policies irrestritas removidas para `public`, `anon` e `authenticated`;
- todos os privilégios de tabelas e sequências revogados de `anon`;
- leitura autenticada limitada por membership de conta ou de loja;
- escrita nos overrides financeiros limitada ao próprio usuário;
- leitura direta de `access_token` e `refresh_token` bloqueada para `authenticated`;
- view `shopee_shops_safe` criada com `security_invoker` e sem tokens;
- default privileges futuros alterados para concessão explícita;
- assertions transacionais incluídas para impedir aplicação parcial insegura.

## Evidências verificadas

| Verificação | Staging | Produção |
|---|---:|---:|
| Grants de tabela para `anon` | 0 | 0 |
| Policies irrestritas | 0 | 0 |
| Policies por membership de conta | 24 | aplicadas |
| Policies por membership de loja | 15 | aplicadas |
| `shopee_shops_safe` com `security_invoker` | sim | sim |
| `authenticated` pode ler `access_token` | não | não |
| `authenticated` pode ler `refresh_token` | não | não |

Testes de isolamento:

- staging: membro autorizado leu 3 posições de estoque; UUID aleatório leu zero;
- produção: usuário cliente autorizado leu 7.205 pedidos, 276 posições de estoque vinculadas, 94 produtos e 6 lojas seguras;
- produção: UUID aleatório leu zero nesses quatro conjuntos.

Validações locais executadas:

- `node tests/security-rls-contract.test.mjs` — 4 testes aprovados;
- `node tests/frontend-contract.test.mjs` — aprovado;
- `node tests/release-contract.test.mjs` — 2 testes aprovados;
- `node --check app.js` — aprovado;
- `git diff --check` nos arquivos deste gate — sem erro de whitespace.

## Pendências que não bloqueiam a contenção

- habilitar proteção contra senhas vazadas no Auth;
- revisar a extensão `pg_net` instalada no schema `public`;
- decidir política jurídica e técnica de retenção/anonimização antes de qualquer remoção de PII histórica;
- migrar definitivamente os tokens legados para Vault e aposentar os fluxos antigos;
- publicar os arquivos por PR controlado; o Netlify já fará o deploy de produção quando a mudança chegar à `main`.

## App Shopee criado após o gate

- nome: `Mavix Hub`;
- categoria: `ERP System`;
- status inicial: `Developing`;
- Test Partner ID: `1238618`;
- domínio de teste: `https://qzcxukcwvjnhbnwpjceg.supabase.co`;
- callback v3: `https://qzcxukcwvjnhbnwpjceg.supabase.co/functions/v1/shopee-oauth-callback-v3`;
- secret `MAVIS_SHOPEE_V3_ENABLED` mantido em `false` até os testes de Sandbox;
- Partner Key não registrada neste documento, no Git ou no chat.

## Preparação do OAuth v3 em produção

Secrets confirmados:

- `SHOPEE_THIRD_PARTY_PARTNER_ID`;
- `SHOPEE_THIRD_PARTY_PARTNER_KEY`;
- `SHOPEE_THIRD_PARTY_REDIRECT_URI`;
- `MAVIS_SHOPEE_V3_ENABLED=false`.

Edge Functions implantadas via Supabase MCP, ainda sem tráfego habilitado:

| Função | Versão | `verify_jwt` | SHA-256 do bundle |
|---|---:|---|---|
| `shopee-oauth-v3` | 1 | `true` | `bc99b5b25e43e61ec1c79f96219e817d4e725df13a009b95687be10d78e39a73` |
| `shopee-oauth-callback-v3` | 1 | `false` | `86bf769a61b0f0ce086237b19f9db1b1aa1c42333f962f615ba678642ac75289` |
| `shopee-sync-v3` | 1 | `true` | `d4e6cb7e32f6fe00feb8332c48834cb245b083ec7db38f17e7d60d5495b74651` |

Smoke tests com a feature flag desligada:

- callback sem parâmetros: HTTP `303` para o frontend com `shopee_code=connection_unavailable`;
- `shopee-oauth-v3` sem JWT: HTTP `401`;
- `shopee-sync-v3` sem JWT: HTTP `401`.

Hardening do Supabase Auth aplicado:

- senha mínima: 8 caracteres;
- troca segura de senha: habilitada;
- senha atual exigida para atualização: habilitada;
- proteção por base de senhas vazadas permanece indisponível no plano Free e exige upgrade para Pro.

## Rollback e cautela

A migration é predominantemente restritiva. Não executar rollback global para restaurar grants anônimos. Se alguma tela legítima regressar, conceder apenas o acesso mínimo ao objeto afetado, com policy de tenant e teste negativo correspondente. Nenhum dado foi apagado nesta execução.
