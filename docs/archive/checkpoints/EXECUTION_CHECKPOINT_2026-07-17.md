# Checkpoint de execução — Mavix Hub

## Retomada após reinicialização — 17/07/2026

- Repositório, índice e objetos Git verificados com `git fsck --full`; não há corrupção.
- Objetos órfãos comparados com o `HEAD`; continham apenas versões equivalentes dos documentos do Gate 1, sem trabalho perdido.
- Último commit publicado confirmado: `e5650b9e59e280b19c80d3c9fe9f1e7818a53592` (`Finalize Shopee reviewer release`).
- PR draft `#2` aberto, mergeável e atualizado com as evidências do gate.
- Gate 1 de segurança e criação do app `Mavix Hub` já concluídos; feature flag v3 permanece desabilitada.
- Correções do próximo gate publicadas: política pública, experiência read-only do reviewer, CORS e compatibilidade da migration OAuth v3.
- Marca pública alinhada para `Mavix Hub`; identificadores técnicos legados `MAVIS_*`/`mavis-*` foram preservados.
- `supabase/.temp/` passou a ser ignorado sem remover o vínculo local da CLI.
- Teste de contrato do frontend ampliado para cobrir marca, política pública, modo `CLIENT`, CORS e timestamps de importação.
- Testes locais, build allowlisted, validação de release e sintaxe JavaScript passaram.
- As duas execuções do GitHub Actions para `e5650b9` passaram, incluindo `deno check` das Edge Functions.
- Nenhuma alteração foi feita em staging, produção ou Netlify durante esta retomada; no GitHub, somente a branch e a descrição do PR draft foram atualizadas.

### Próxima ação exata

1. Aguardar/confirmar o deploy preview correspondente ao commit `e5650b9`.
2. Validar visualmente login, política de privacidade e página de Integrações com a conta reviewer.
3. Revisar o diff final e a base encadeada do PR antes de decidir se ele pode sair de draft.
4. Não fazer merge nem promover produção sem autorização explícita.

## Produção preparada para avaliação Shopee — 15/07/2026

- Release de avaliação publicado em `https://ecommerce-control-jv.netlify.app/?review=shopee`, deploy `6a5709c3d792d67c4a8e22df`.
- Política de Privacidade publicada e vinculada ao login.
- Migrações `third_party_oauth_v3` e `harden_production_security_gate` aplicadas à produção.
- Função `mavis-integrations-v1` v2 ativa em produção, com CORS exato para preview e domínio público.
- Conta `cliente@jvimports.com.br` confirmada como `CLIENT` / `client`; senha forte rotacionada e sessões antigas revogadas.
- Teste API de produção aprovado: login, conta `JV Imports`, duas lojas Shopee em estado inativo, UPSeller ativo e três módulos.
- Security Advisor pós-hardening: 0 ERROR, 2 WARN, 10 INFO. WARN restantes: `pg_net` em `public` e leaked-password protection desabilitada.

Atualizado em 2026-07-14 após a reinicialização do Windows e validação do Docker.

## Retomada após reinicialização

- Docker Desktop validado: Engine `29.6.1` em execução.
- Schema `public` da produção exportado com sucesso, sem dados, para `tmp/prod-public-schema.sql`.
- Inspeção do dump: zero `COPY`, zero `INSERT`, zero URLs de banco, zero IDs de projeto e zero credenciais reais.
- Staging `zgfehhqfodhspklbwhgc` confirmado saudável e vazio pelo conector Supabase: nenhuma tabela em `public` e nenhuma migração.
- O backup direto do staging via CLI falhou porque a senha local foi recusada; como o staging está vazio, não há schema/dados de usuário a preservar.
- A tentativa de aplicar o baseline foi rejeitada antes da execução pelo gate de segurança: o dump contém grants e políticas RLS da produção, incluindo padrões permissivos, e requer autorização explícita do usuário.
- Nenhuma alteração foi feita no staging ou na produção durante a retomada.

## Execução autorizada no staging

- Usuário autorizou explicitamente aplicar o baseline derivado da produção com os grants e políticas existentes para posterior auditoria.
- Baseline aplicado com sucesso no staging vazio como `production_public_schema_baseline_20260714`.
- Migração multi-shop anterior já estava integralmente materializada no baseline (9 colunas `shop_id NOT NULL` e 9 índices compostos); não foi reexecutada.
- Migração `third_party_oauth_v3` inicialmente falhou de forma transacional porque `authorization` é palavra reservada no PostgreSQL 17.
- Alias corrigido para `authz` em `20260710193000_third_party_oauth_v3.sql`; reprodução mínima confirmou o erro e o controle corrigido passou.
- Migração OAuth v3 reaplicada com sucesso.
- Nova migração `20260714220328_harden_staging_security_gate.sql` criada e aplicada no staging.
- Security Advisor após hardening: zero `ERROR`, zero `WARN`; restam 7 `INFO` de RLS sem política (negação por padrão).
- Edge Functions publicadas no Mavis Staging, todas versão 1 e `ACTIVE`: `shopee-oauth-v3`, `shopee-oauth-callback-v3`, `shopee-ads-import-v1`, `shopee-sync-v3`.
- Smoke tests: funções protegidas retornaram HTTP 401 sem credencial; callback público retornou HTTP 303 controlado.
- Testes locais: 3/3 passaram; validação de release e `git diff --check` passaram.
- Produção permaneceu intocada.

## Reviewer autenticado concluído

- Usuário `cliente@jvimports.com.br` criado pelo usuário no Auth do staging, confirmado e associado a uma conta sintética `Mavis Reviewer - Staging` com papel `client`.
- Papel de autorização configurado em `app_metadata` como `CLIENT`; senha nunca foi lida, exibida ou armazenada pelo agente.
- Corrigido `supabase-auth-sync-v2.js`: `showDashboard` preserva o usuário, perfil `CLIENT` não inicializa controles v2 e o painel legado ausente não causa mais exceção.
- Corrigido CORS de `mavis-integrations-v1` para o preview `mavis-review--ecommerce-control-jv.netlify.app`.
- Publicadas no staging: `mavis-integrations-v1` v2, `shopee-auth-v2` v1 e `shopee-sync-v2` v1.
- Novo deploy preview criado no mesmo alias, deploy ID `6a56b6c72e200b69d384e014`; produção não alterada.
- Teste autenticado passou: entrada em **Integrações**, perfil `CLIENT`, conta correta, cards Shopee/UPSeller carregados e nenhum erro novo no console.
- Controles de importação/sincronização confirmados invisíveis; `#importer-view` marcado read-only.
- Teste direto de mutação confirmado pelos logs do staging: `POST /functions/v1/shopee-ads-import-v1` retornou HTTP `403`; nenhuma escrita foi executada.

## Estado confirmado

- Workspace: `C:\Users\João Victor\Documents\Projeto Controle JV`
- Branch: `codex/third-party-oauth-v3`
- Repositório: `JVImports/E-commerce-Control`
- PR draft: https://github.com/JVImports/E-commerce-Control/pull/2
- Último commit publicado: `480b6d8b85408d8ac243d8fef040ca252d4388d9`
- CI remoto: aprovado, run 17.
- Preview: https://mavis-review--ecommerce-control-jv.netlify.app/?review=shopee
- Preview aponta para Mavis Staging e foi validado visualmente.
- Produção não foi alterada.

## Supabase

- Produção: `qzcxukcwvjnhbnwpjceg`
- Staging: `zgfehhqfodhspklbwhgc`
- Senhas locais: `.env.local`, ignorado pelo Git. Nunca imprimir ou versionar.
- Ambas as senhas foram validadas com `supabase link`.
- Supabase CLI v2.101.0 instalada localmente como `supabase.exe` e `supabase-go.exe`.
- Exportação ainda não ocorreu. A primeira tentativa parou antes do dump por falta do Docker.

## Docker/Windows

- Docker Desktop 4.82.0 instalado.
- CPU/firmware: VT-x, SLAT e virtualização confirmados.
- Recursos habilitados: WSL, VirtualMachinePlatform e HypervisorPlatform.
- `hypervisorlaunchtype` configurado como `auto`.
- DISM retornou 3010: reinicialização obrigatória.

## Próxima ação exata

1. Confirmar/configurar as secrets Shopee v3 no staging antes de testar OAuth real.
2. Obter um export Ads Shopee Brasil anonimizado e congelar/validar o mapeamento do parser.
3. Executar os checks remotos do PR com as correções locais publicadas no branch.
4. Atualizar o PR draft com a evidência do staging e revisar o diff final.
5. Rodar a cadeia controlada de PRs e merge somente após aprovação explícita; produção continua bloqueada até lá.

## Gates restantes, na ordem

1. Exportação somente do schema.
2. Sanitização e aplicação no staging.
3. Advisors de segurança/RLS.
4. Deploy das funções no staging.
5. Criação/validação do acesso reviewer.
6. Teste autenticado read-only.
7. Cadeia controlada de PRs e merge na `main`.

## Guardrails

- Não copiar dados/PII da produção.
- Não exibir senhas, tokens ou conteúdo de `.env.local`.
- Não alterar produção antes de staging, advisors e preview autenticado passarem.
- Manter OAuth/Shopee v3 desabilitado até aprovação.
- Preservar v2/crons como rollback.
