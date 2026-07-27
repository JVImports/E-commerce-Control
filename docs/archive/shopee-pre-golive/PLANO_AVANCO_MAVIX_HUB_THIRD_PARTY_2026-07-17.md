# Plano de avanço — Mavix Hub + Shopee Third-party App

Data-base: 17/07/2026
Escopo: criação do app Shopee, correções derivadas da auditoria de 16/07/2026 e preparação coordenada de Supabase, GitHub e Netlify.

## Decisão executiva

A conta Third-party foi aprovada, mas o app não deve autorizar lojas nem iniciar coleta de dados reais até o fechamento do gate crítico de segurança. O cadastro do app no Console pode ser feito antes do rollout, desde que quatro definições estejam fechadas: marca, categoria/API, domínio de callback e escopo de dados.

Ordem recomendada:

1. fechar decisões de cadastro e conter as exposições críticas;
2. criar o app para obter credenciais de Sandbox, sem conectar sellers reais;
3. reconciliar staging, GitHub e Netlify;
4. validar OAuth e coleta V2 em Sandbox/staging;
5. fazer canário em produção com uma loja interna;
6. solicitar Go-Live somente após todos os gates.

## Estado confirmado

- O formulário fotografado informa que apps novos terão somente Open API V2.0.
- Campos visíveis: `App Category`, `App Name` (máximo 30 caracteres), `App Description` (máximo 250), `Test Redirect URL Domain` e logo PNG/JPG/JPEG menor que 3 MB.
- O logo disponível tem 1.254 × 1.254 px, formato PNG e 806.138 bytes; atende aos limites visíveis do formulário.
- O código atual consome famílias V2 de Auth, Product, Order, Payment e Ads.
- A auditoria encontrou leitura anônima em 23 tabelas, leitura global autenticada em 18, escrita anônima em configuração financeira, tokens legados em claro e drift entre produção/staging/GitHub.
- O Netlify já está conectado ao GitHub e publica automaticamente quando a `main` muda; resta validar e documentar a rastreabilidade do commit em cada deploy.
- A branch `codex/third-party-oauth-v3` está 38 commits à frente de `origin/main`, e o worktree contém alterações e artefatos ainda não versionados.
- Há uma inconsistência de marca: e-mail e logo usam `Mavix`, enquanto UI, política, documentação e identificadores internos usam `Mavis`.

## Execução iniciada em 17/07/2026

- Gate crítico de Data API aplicado primeiro em staging e depois em produção pela migration `20260717135438_close_public_data_api_exposure.sql`.
- Acesso `anon` a tabelas públicas reduzido a zero e policies irrestritas para `public`/`anon`/`authenticated` removidas.
- Leitura autenticada passou a exigir vínculo em `account_members`, diretamente por `account_id` ou pela relação `shop_id -> account_id`.
- Tokens legados de loja foram retirados do alcance do browser; a leitura pública do frontend passa pela view `shopee_shops_safe`.
- Teste negativo em staging e produção confirmou que uma identidade sem vínculo recebe zero linhas.
- Usuário válido de produção continuou vendo 7.205 pedidos, 276 posições de estoque vinculadas, 94 produtos e 6 lojas pela view segura.
- Security Advisor ficou sem erro crítico; permanecem avisos de hardening e objetos deliberadamente sem policy, descritos no relatório de execução.
- O dropdown real foi inspecionado no Console e a categoria `ERP System` foi selecionada: a Shopee a descreve como a opção para fornecedores de tecnologia que gerenciam processos centrais dos sellers.
- O app `Mavix Hub` foi criado na categoria `ERP System`, com status `Developing` e Test Partner ID `1238618`.
- O logo, a descrição de 241/250 caracteres e o domínio de teste do projeto Supabase aparecem corretamente no detalhe do app.
- O Supabase de produção recebeu Partner ID, Partner Key e callback v3; `MAVIS_SHOPEE_V3_ENABLED=false` mantém o fluxo bloqueado até o canário.
- As funções `shopee-oauth-v3`, `shopee-oauth-callback-v3` e `shopee-sync-v3` estão implantadas e passaram nos smoke tests de bloqueio/autenticação.
- O Auth exige senha mínima de 8 caracteres, login recente e senha atual para troca; a verificação de senha vazada requer plano Pro.

## Arquitetura-alvo mínima

```text
Browser autenticado
  -> Edge Function de usuário (JWT + membership)
     -> tabelas por account_id + connection_id, protegidas por RLS

Shopee -> callback público estável
  -> state aleatório, hash, uso único e TTL curto
  -> troca server-side de code por tokens
  -> access/refresh token no Vault

Worker de sincronização
  -> credencial por authorization/connection
  -> Open API V2 oficial
  -> sync_runs + sync_cursors + idempotência
  -> dados segregados por tenant
```

O `partner_key`, os tokens e qualquer chave administrativa nunca passam pelo browser, GitHub, Netlify bundle, logs ou documentação.

## Fase 0 — decisões antes do formulário (meio dia)

### 0.1 Padronizar a marca

Recomendação: adotar `Mavix Hub`, porque coincide com a mensagem do titular, o e-mail `mavix.hub@gmail.com` e o wordmark do logo.

Ações:

- trocar textos públicos `Mavis` por `Mavix Hub`;
- alinhar título, alt text, política de privacidade, documentação, nomes de assets e URLs futuras;
- manter nomes técnicos internos `MAVIS_*` temporariamente se a troca gerar risco, documentando-os como legado técnico;
- confirmar que razão social e controlador continuam `JV IMPORTS LTDA`.

Aceite: o nome do Console, logo, tela de login, política e screenshots exibem a mesma marca.

### 0.2 Escolher a categoria pelo conjunto de APIs

Não adivinhar a categoria. Abrir o dropdown e montar uma matriz entre cada opção e estes módulos/endpoints necessários:

- Auth: autorização, troca e renovação de token;
- Product: itens, detalhes e variações;
- Order: lista e detalhes;
- Payment: escrow e visão de receitas;
- Ads: campanhas e desempenho diário.

Se nenhuma categoria liberar todas as famílias necessárias, criar apps distintos por finalidade, conforme a orientação pública da Shopee. Não selecionar Chat, PII não mascarada ou serviços que o produto não implementa.

Aceite: categoria escolhida e endpoints autorizados registrados em documento, antes de clicar em `Create`.

### 0.3 Congelar domínio e callback

Opção de menor mudança para o primeiro app:

- domínio de teste: `https://qzcxukcwvjnhbnwpjceg.supabase.co`;
- callback exato: `https://qzcxukcwvjnhbnwpjceg.supabase.co/functions/v1/shopee-oauth-callback-v3`.

Antes do envio, confirmar no Console se o campo aceita somente a origem ou a URL completa. O `redirect_uri` usado na assinatura/autorização deve pertencer exatamente ao domínio cadastrado. Não usar deploy preview como callback oficial.

### 0.4 Fixar escopo de dados

- Brasil;
- somente APIs necessárias ao produto;
- PII mascarada por padrão;
- não solicitar dados não mascarados nesta primeira versão;
- não usar crawler, API interna ou coleta fora do OAuth oficial.

## Fase 1 — gate crítico de segurança (0–2 dias)

Nenhum novo tenant e nenhuma loja conectada ao app novo até o aceite desta fase.

### Supabase

1. Revogar `anon` das 23 tabelas comerciais e das views/objetos alcançáveis.
2. Remover policies autenticadas `USING (true)` e exigir membership de `account_members` por `account_id`; onde o legado usa `shop_id`, resolver `shop_id -> connection_id -> account_id`.
3. Bloquear INSERT/UPDATE/DELETE anônimo em `commerce_fee_settings` e separar default global imutável de override por tenant.
4. Revogar privilégios padrão de tabelas, funções e sequências para `anon`/`authenticated` e conceder acesso futuro explicitamente na mesma migration das policies. A mudança recente do padrão da plataforma não corrige automaticamente este projeto existente.
5. Criar testes negativos com três identidades: anônimo, usuário A e usuário B. A não pode ler ou alterar dados de B.
6. Tratar retenção: separar dados fiscais que tenham base legal de PII operacional; anonimizar/remover endereço e identificadores de comprador após o prazo aplicável. Não executar exclusão em massa sem backup, consulta jurídica e ensaio em staging.
7. Habilitar proteção contra senhas vazadas; exigir MFA/step-up para owners/admins e operações sensíveis.
8. Preservar logs do incidente, sem copiar PII para Git ou relatórios.

### Critérios de aceite do Gate 1

- chamada anônima recebe 401/403 ou zero linhas em todo objeto comercial;
- dois tenants de teste ficam integralmente isolados;
- nenhum write financeiro funciona como `anon`;
- Security Advisor sem erro de exposição crítico;
- política pública de retenção corresponde ao comportamento implementado;
- app novo ainda sem sellers reais.

## Fase 2 — produção reproduzível (2–5 dias)

### GitHub

1. Classificar o worktree atual: código do release, relatórios que devem ser versionados e artefatos locais que devem permanecer ignorados.
2. Recuperar ou documentar a fonte das cinco Edge Functions que existem apenas em produção antes de aposentá-las.
3. Reconciliar migrations aplicadas em produção, staging e checkout; não aplicar cegamente um diff de staging em produção.
4. Dividir o trabalho em PRs pequenos:
   - contenção RLS/grants;
   - retenção/anonimização;
   - baseline de produção e manifests;
   - OAuth v3/Vault;
   - Netlify Git-based;
   - padronização Mavix.
5. Manter CI com build allowlisted, testes, `deno check`, secret scan, `git diff --check` e testes de isolamento/RLS.
6. Proteger `main`: PR obrigatório, checks obrigatórios e revisão antes de merge.

### Supabase

1. Usar produção como evidência, gerar baseline limpo e conferir `migration list`.
2. Rodar Advisors antes e depois de cada migration.
3. Manter produção e staging em projetos diferentes; staging não recebe Protected Data real da Shopee.
4. Criar manifesto de release: project ref, migrations, slugs/versões/hashes das Edge Functions e commit do frontend.

### Netlify

1. Confirmar a integração GitHub já existente, a branch `main`, o build command e o diretório `dist` como configuração efetiva do site.
2. Exigir deploy preview verde antes do merge; produção deve registrar o `commit_ref` correspondente à mudança da `main`.
3. Definir `MAVIS_SUPABASE_URL` e chave publicável por contexto. Segredos nunca entram em `netlify.toml`.
4. Confirmar CSP, headers, HTTPS/TLS, política pública e rota SPA.
5. Escolher domínio canônico. Redirecionar aliases para ele e não usar previews no Console Shopee.

### Critérios de aceite do Gate 2

- um commit identifica exatamente frontend, migrations e funções implantadas;
- deploy de produção é reproduzível e possui rollback documentado;
- staging e produção usam variáveis e dados segregados;
- scans e testes estão verdes;
- não há segredo no Git ou bundle público.

## Fase 3 — criação segura do app (pode ocorrer após as decisões da Fase 0)

Estado: app de teste criado em 17/07/2026, status `Developing`.

Preenchimento provisório:

| Campo | Valor planejado |
|---|---|
| App Category | `ERP System` |
| App Name | `Mavix Hub` |
| App Description | `Mavix Hub is a multi-tenant operations platform for Brazilian marketplace sellers. It securely connects authorized Shopee shops to synchronize catalog, inventory, orders, payments and advertising data for dashboards and operational analysis.` |
| Test Redirect URL Domain | `https://qzcxukcwvjnhbnwpjceg.supabase.co` se o callback direto for mantido |
| App Logo | `Logo-Mavix-Hub.png` |

Identificador operacional não secreto: Test Partner ID `1238618`.

Após criar:

1. salvar App ID/Partner ID como identificador operacional;
2. cadastrar `partner_key` apenas nos secrets das Edge Functions do ambiente correto;
3. não inserir segredo em chat, screenshot, tabela pública, `.env` versionado ou Netlify frontend;
4. registrar data de criação, categoria, região, domínio/callback e prazo de 90 dias;
5. manter credenciais de Sandbox separadas de Live.

## Fase 4 — OAuth v3 e coleta em Sandbox/staging (5–9 dias)

1. Corrigir o fluxo v3 antes do deploy:
   - ao reautorizar loja, revogar autorização substituída e apagar secrets órfãos do Vault;
   - rejeitar ou agregar chaves naturais duplicadas no importador Ads;
   - executar preflight de roles, ownership e conflitos de backfill;
   - manter feature flag `MAVIS_SHOPEE_V3_ENABLED=false` por padrão.
2. Implantar em staging as funções OAuth, callback, sync v3 e integrações com as configurações JWT corretas.
3. Testar autorização, cancelamento, code inválido, replay, state expirado, conflito cross-tenant, renovação do refresh token e desautorização.
4. Garantir que refresh token novo substitui atomicamente o anterior e nunca aparece em log/resposta ao browser.
5. Implementar coleta incremental e idempotente por `account_id + connection_id`.
6. Migrar `sync_state/sync_log` para `sync_runs/sync_cursors`, com lease por conexão/módulo, contagens, erro sanitizado e retry controlado.
7. Reduzir write amplification: comparar hash/`updated_at` antes de atualizar.
8. Validar rate limits, timeouts e taxa de sucesso por endpoint.

### Critérios de aceite do Gate 3

- suíte OAuth negativa e positiva verde;
- nenhum token em browser, tabela exposta ou log;
- coleta de cada módulo é idempotente;
- dois tenants e duas lojas não colidem;
- dados reais da Shopee não existem em staging;
- callback cadastrado é exatamente o usado pelo código.

## Fase 5 — canário em produção (10–14 dias)

1. Aplicar migrations aditivas com backup, preflight e rollback.
2. Implantar funções v3 ainda desabilitadas; conferir hashes e secrets por nome, nunca por valor.
3. Habilitar uma conta e uma loja interna.
4. Comparar v3 com o legado: produtos, variações, pedidos, financeiro e Ads; conferir contagens, valores, frescor e duplicidades.
5. Observar erros, duração, renovação de token, limites e taxa de sucesso por pelo menos um ciclo completo.
6. Habilitar a segunda loja interna somente após aceite da primeira.
7. Rotacionar credenciais que passaram pelo armazenamento legado.
8. Retirar tráfego do legado; remover código/tabelas/colunas somente em mudança posterior, com janela de observação e rollback. Nenhum `DROP` automático.

## Fase 6 — prontidão para Go-Live e operação contínua (15–20 dias)

1. Conta de review dedicada, estável e com todos os recursos declarados visíveis; dados sintéticos e nenhuma PII real.
2. Roteiro curto de uso e 1–10 screenshots coerentes com o app publicado.
3. Arquitetura e data flow, inventário de ativos, matriz de acesso e lista de subprocessadores.
4. Programa documentado de segurança e privacidade, responsável sênior, scans trimestrais, avaliação anual/major release e processo de patches.
5. Runbook de incidente com notificação à Shopee em até 24 horas quando Shopee Content estiver em risco.
6. Logs de acesso/configuração sem PII, alertas e retenção compatível com a DPP.
7. Monitoramento de saúde da integração:
   - entrar em Live dentro de 90 dias da criação;
   - fazer ao menos uma chamada API nos 90 dias após Live;
   - manter sucesso médio diário de pelo menos 90%; HTTP 200 só conta como sucesso com `error` e `message` vazios.

## Sequência de PRs sugerida

1. `security/close-anon-and-global-rls`
2. `privacy/retention-and-pii-anonymization`
3. `ops/reconcile-production-baseline`
4. `brand/standardize-mavix-hub`
5. `platform/netlify-git-deploy`
6. `shopee/oauth-v3-vault-hardening`
7. `shopee/sync-v3-tenant-idempotency`
8. `release/shopee-canary-and-go-live-evidence`

Cada PR deve ter rollback, evidência de teste e nenhum segredo.

## Próxima sessão recomendada

1. abrir a conta aprovada e capturar apenas as opções do dropdown `App Category`;
2. confirmar por escrito `Mavix Hub` versus `Mavis`;
3. confirmar se o callback continuará no domínio Supabase;
4. iniciar a migration de contenção RLS em staging;
5. só então preencher e criar o app de Sandbox.

## Fontes locais principais

- `Auditoria/AUDITORIA_SUPABASE_CONTROLE_JV_2026-07-16.md`
- `THIRD_PARTY_TRANSITION.md`
- `RELEASE_READINESS.md`
- `docs/shopee-post-submission-official-criteria.md`
- `Formulário de Criação de APP.png`

## Fontes oficiais de referência

- [Shopee — criação de perfil e app Third-party no Brasil](https://open.shopee.com/developer-guide/384)
- [Shopee — fluxo oficial de autorização Open API V2](https://open.shopee.com/developer-guide/385)
- [Shopee — Data Protection Policy](https://open.shopee.com/policy?policy_id=1)
- [Shopee — Platform Partner Rules](https://open.shopee.com/policy?policy_id=2)
- [Shopee — Terms of Service](https://open.shopee.com/agreement)
- [Supabase — changelog atual](https://supabase.com/changelog)
- [Supabase — proteção da Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase — secrets de Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [Supabase — Vault](https://supabase.com/docs/guides/database/vault)
