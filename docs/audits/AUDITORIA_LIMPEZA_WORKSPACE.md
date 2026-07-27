# Auditoria de limpeza do workspace

Atualizado em 18/07/2026, após o envio do Go-Live Shopee e a limpeza autorizada pelo usuário.

## Resultado da limpeza

| Item removido | Tamanho aproximado | Motivo |
|---|---:|---|
| `tmp/` | 347,13 MB | Instaladores e cópias da CLI, derivados de PDFs, previews e arquivo vazio. O checkpoint e o baseline úteis foram preservados em novos locais. |
| `dist/` | 1,42 MB | Build reproduzível por `node scripts/build.mjs`. |
| `Logo Mavis.png` | 0,77 MB | Duplicata byte a byte de logos versionados. |
| `supabase.exe` | 113,46 MB | Wrapper Bun quebrado nesta máquina; não é dependência do skill nem do Supabase MCP. |
| `supabase-go.exe` | 93,85 MB | CLI opcional e substituível por download; o fluxo atual usa MCP. |
| Três worktrees antigos | 3,42 MB | Estavam limpos e seus patches já existiam na `origin/main`. As branches foram preservadas. |

Espaço liberado: aproximadamente **560 MB**.

## Nova organização

- `docs/checkpoints/`: checkpoints atuais de OAuth e Go-Live.
- `docs/shopee/`: diagnóstico técnico ativo da integração.
- `docs/runbooks/`: procedimentos operacionais vigentes.
- `docs/audits/`: auditorias de segurança, Supabase e limpeza.
- `docs/ads/`: documentação do Analisador de Anúncios.
- `docs/archive/shopee-pre-golive/`: pesquisa, formulários e pareceres anteriores ao Go-Live.
- `docs/archive/legacy-v2/`: documentação V2 preservada para consulta/rollback.
- `docs/archive/project-history/`: planos e handovers antigos.
- `docs/archive/legacy-deploy/`: código e BAT do deploy antigo, marcados como não vigentes.
- `docs/archive/schema-snapshots/`: snapshot antigo de colunas públicas.
- `evidence-private/shopee/`: screenshots e PDFs privados ignorados pelo Git.
- `evidence-private/supabase/`: baseline privado de schema ignorado pelo Git.

## Preservado durante a revisão da Shopee

- Screenshots usadas no Go-Live e configuração do app com chave mascarada.
- PDFs originais da reprovação anterior.
- Baseline `prod-public-schema-2026-07-14.sql`.
- Código, migrations, Edge Functions e testes em `supabase/` e `tests/`.
- `.netlify/`, que mantém o vínculo local do site.
- `supabase/.temp/`, que mantém metadados locais de link/configuração.
- `.env.local`, que contém senhas de banco e permanece ignorado pelo Git.
- Branches `agent/mavis-frontend`, `agent/mavis-release` e `agent/mavis-supabase`; somente os worktrees físicos foram removidos.

## Cuidados restantes

- Não versionar o conteúdo de `evidence-private/`.
- Não executar `docs/archive/legacy-deploy/deploy_supabase.bat`; ele é apenas histórico e dependia da CLI removida.
- Não remover código V2 enquanto o fluxo Live V3 não estiver validado e o rollback não for formalmente encerrado.
- Depois da decisão da Shopee, revisar se screenshots e PDFs ainda precisam permanecer localmente.
- A organização do workspace foi preparada na branch `agent/organize-project-workspace`, criada a partir da `origin/main` após o squash do PR #6.
- `supabase/functions/shopee-oauth-callback-v3/index.ts` continua aparecendo modificado apenas por fim de linha, sem diferença lógica detectada.
