# Checkpoint — OAuth Shopee Sandbox e preparação para Go-Live

Data: 2026-07-17 (America/Sao_Paulo)

## Objetivo atual

Concluir a validação OAuth do app `Mavix Hub` na Shopee Open Platform em Sandbox, reunir evidências e então submeter o app para Go-Live. Somente depois da aprovação e emissão das credenciais Live será possível reautorizar as lojas reais.

## Estado confirmado

- App Shopee: `Mavix Hub`, categoria `ERP System`, status `Developing`.
- Test Partner ID não secreto: `1238618`.
- Callback cadastrado: `https://qzcxukcwvjnhbnwpjceg.supabase.co/functions/v1/shopee-oauth-callback-v3`.
- Site público: `https://ecommerce-control-jv.netlify.app/?review=shopee`.
- Usuário operacional: `jvimports.vendas@gmail.com`, e-mail confirmado, `owner` da conta ativa `JV Imports`.
- As duas lojas reais continuam em `legacy_pending_reauth`; não existe autorização v3 ativa nem token v3 no Vault.

## Incidente e causa raiz

Ao clicar em reautorizar, a Shopee respondeu:

```json
{"error":"invalid_partner_id","message":"Invalid partner_id, please have a check."}
```

A causa foi mistura de ambientes: o Test Partner ID `1238618` estava sendo enviado ao endpoint Live `https://partner.shopeemobile.com/api/v2/shop/auth_partner`.

Reprodução mínima:

- Live + `partner_id=1238618` + timestamp + assinatura descartável: `invalid_partner_id`.
- Sandbox `https://partner.test-stable.shopeemobile.com` + mesmo ID: o Partner ID é aceito e a validação avança para `Wrong sign`.
- SHA-256 de `1238618`: `1a572f167aa35dce7b8b9e83ed3d3eae64b49f93c6ad3bcef90ecfe8ac922659`, igual ao digest do secret de produção. Erro de digitação foi descartado.

Mitigação já aplicada: `MAVIS_SHOPEE_V3_ENABLED=false` em produção.

## Correção preparada

Branch: `codex/shopee-oauth-sandbox-fix`

Commit inicial da correção: `b4ed576`

PR: https://github.com/JVImports/E-commerce-Control/pull/4

Preview: https://oauth-sandbox-fix--ecommerce-control-jv.netlify.app/?review=shopee

A correção:

- exige `SHOPEE_THIRD_PARTY_ENVIRONMENT=live|sandbox` e falha fechada quando ausente/inválido;
- centraliza a resolução dos endpoints em `supabase/functions/_shared/shopee-v3-environment.ts`;
- usa `partner.test-stable.shopeemobile.com` para Sandbox;
- filtra OAuth, integrações, desconexão e sync pelo ambiente configurado;
- persiste o ambiente nas autorizações e conexões;
- impede que uma conexão Sandbox colida ou substitua uma loja Live;
- identifica explicitamente `Shopee Open Platform · Sandbox` na UI;
- orienta a usar apenas conta/loja de teste, nunca loja real;
- adiciona teste unitário Deno e contrato de regressão ao CI.

Migration nova:

`supabase/migrations/20260717193756_segregate_shopee_oauth_v3_environment.sql`

## Validações concluídas

- `deno check` nas funções e módulo compartilhado: aprovado.
- `deno test supabase/functions/_shared/shopee-v3-environment.test.ts`: 3/3.
- `node --test tests/*.test.mjs`: 11/11.
- build e validação do pacote público: aprovados.
- dois checks GitHub da PR #4: aprovados antes da inclusão deste checkpoint; aguardar o novo check após o push do documento.
- migration corretiva aplicada em staging `zgfehhqfodhspklbwhgc`.
- funções corretivas publicadas em staging com `SHOPEE_THIRD_PARTY_ENVIRONMENT=sandbox` e flag desligada.
- callback staging: HTTP 303 seguro para o domínio oficial.
- RPC nova no staging: `anon=false`, `authenticated=false`, `service_role=true`.
- advisors do staging: nenhum alerta crítico novo; INFO fail-closed em tabelas privadas e aviso conhecido de leaked-password protection.

## Produção antes da continuação

Projeto Supabase: `qzcxukcwvjnhbnwpjceg`.

- PR #3 já integrada em `main` no commit `f9b11b34bef4e5230958c112497beaea5921c98d`.
- frontend da PR #3 está em produção.
- funções v3 da PR #3 estão publicadas.
- OAuth está desligado como mitigação.
- a migration corretiva de ambiente ainda não foi aplicada em produção.
- as funções corretivas da PR #4 ainda não foram publicadas em produção.
- o frontend corretivo da PR #4 ainda não foi promovido ao site público.

## Aprovação explícita do usuário

O usuário aprovou continuar com:

1. merge da PR #4 em `main`;
2. migration corretiva em produção;
3. deploy das Edge Functions corretivas em produção;
4. deploy do frontend corretivo na Netlify;
5. ativação controlada do OAuth em modo Sandbox.

## Próximas ações exatas

1. Incluir este checkpoint na PR #4, aguardar o CI e confirmar que os checks passaram.
2. Marcar a PR #4 pronta e fazer merge com o SHA atualizado do head.
3. Aguardar o workflow pós-merge de `main`.
4. Aplicar `segregate_shopee_oauth_v3_environment` em produção via Supabase `apply_migration`.
5. Definir em produção, sem exibir valores:
   - `SHOPEE_THIRD_PARTY_ENVIRONMENT=sandbox`;
   - manter `MAVIS_SHOPEE_V3_ENABLED=false` durante o deploy.
6. Publicar em produção:
   - `shopee-oauth-v3` com JWT;
   - `shopee-oauth-callback-v3` sem JWT (callback público com state/code validation);
   - `shopee-sync-v3` com JWT;
   - `mavis-integrations-v1` com JWT.
7. Fazer smoke test do callback com a flag desligada; deve retornar `connection_unavailable` para o domínio oficial.
8. Confirmar que a árvore local corresponde à árvore de `main` e publicar o frontend na Netlify com contexto production.
9. Verificar no bundle público as mensagens `Sandbox`, `Autorizar loja de teste Shopee` e o aviso de que dados reais não são aceitos.
10. Ativar `MAVIS_SHOPEE_V3_ENABLED=true`.
11. Smoke test do callback sem parâmetros deve avançar de `connection_unavailable` para `callback_invalid`, provando que a flag está ativa.
12. Pedir ao usuário para clicar em `Autorizar loja de teste Shopee` e usar uma conta/loja Sandbox. Uma conta Shopee real não funcionará neste estágio.
13. Após o retorno de sucesso, verificar:
   - autorização `environment='sandbox'`;
   - conexão `environment='sandbox'`;
   - tokens presentes apenas no Vault/private;
   - nenhuma resposta/log contendo access ou refresh token;
   - refresh-token e sync de catálogo/pedidos/financeiro/Ads conforme disponibilidade do Sandbox.
14. Reunir screenshots/evidências e submeter o app para Go-Live na Shopee Open Platform.
15. Após aprovação, cadastrar credenciais Live separadas, definir `SHOPEE_THIRD_PARTY_ENVIRONMENT=live`, validar uma loja interna e somente então migrar as lojas reais.

## Bloqueio humano esperado

É necessário que o usuário possua ou crie uma conta/loja de teste no Sandbox da Shopee. Não tentar usar as lojas reais com o Test Partner ID.

## Segurança e preservação

- Não registrar Partner Key, tokens, service role ou credenciais de login neste arquivo, Git, chat ou screenshots.
- Não alterar os arquivos pessoais não rastreados (`Auditoria/`, imagens e rascunhos em `docs/`) sem solicitação explícita.
- Não remover as conexões Live legadas durante o teste Sandbox.
- Não habilitar o ambiente Live até a Shopee emitir Partner ID/Key Live.
