# Documentação do projeto

## Estado atual

- `checkpoints/`: pontos seguros para retomada da execução.
- `shopee/`: diagnóstico técnico ainda relevante para a integração Shopee.
- `runbooks/`: procedimentos operacionais vigentes.
- `audits/`: auditorias de segurança, Supabase e organização do workspace.
- `ads/`: planos e status do Analisador de Anúncios.
- `sql/`: rascunhos SQL que ainda não são migrações oficiais.

## Histórico

- `archive/shopee-pre-golive/`: formulários, pesquisas e pareceres anteriores ao envio do Go-Live.
- `archive/legacy-v2/`: documentação da integração Shopee V2 mantida apenas para rollback e consulta.
- `archive/project-history/`: planos e handovers antigos do produto.
- `archive/checkpoints/`: checkpoints substituídos por estados mais recentes.
- `archive/schema-snapshots/`: snapshots antigos de schema.
- `archive/legacy-deploy/`: script e código de deploy legado, não utilizados no fluxo atual.

## Evidências não versionadas

Screenshots, PDFs de reprovação e baselines privados ficam em `../evidence-private/`. Não devem ser incluídos em commits.

## Fonte de verdade técnica

O código implantável permanece em `../supabase/`, os testes em `../tests/` e o frontend público na raiz. Documentos históricos não substituem migrations, Edge Functions nem testes.
