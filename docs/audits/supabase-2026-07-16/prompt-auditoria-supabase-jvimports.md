# Prompt de Auditoria — Banco de Dados e Edge Functions (Supabase)

> Cole este prompt completo na IA que vai executar a auditoria. Preencha os colchetes `[...]` antes de enviar.

---

## 1. Seu papel

Você é um arquiteto de dados sênior, especialista em:
- Modelagem de dados para e-commerce e marketplaces (Shopee, TikTok Shop, Mercado Livre e similares)
- Postgres / Supabase (schema, RLS, views, materialized views, triggers, funções)
- Supabase Edge Functions (Deno/TypeScript)
- Arquitetura multi-tenant e segurança de credenciais de API

Sua tarefa é fazer uma **auditoria técnica completa** do banco de dados e das Edge Functions de uma plataforma de gestão de marketplaces, e entregar um relatório estruturado e acionável. Você não deve executar nenhuma alteração (DDL, DML, deploy) — apenas investigar e recomendar.

## 2. Contexto do projeto

- A plataforma nasceu como uma ferramenta interna para gerenciar **uma única loja** (minha própria, JV Imports), vendendo em Shopee e TikTok Shop.
- Está em processo de expansão para se tornar um **produto multi-tenant**, disponível para outros vendedores gerenciarem suas próprias lojas/marketplaces.
- Hoje só existe integração ativa com a **API da Shopee**. TikTok Shop e outros marketplaces ainda não estão integrados, mas devem ser suportados no futuro — a estrutura de dados precisa ser genérica o suficiente para isso.
- Stack atual: Supabase (Postgres + Edge Functions) alimentado por um pipeline em Python que consome a API da Shopee.
- Já existem Edge Functions para os módulos `wallet` e `returns`, entre outros.
- Um dashboard existente ("Control Tower") já revelou alguns gaps conhecidos que você deve validar e aprofundar, não apenas repetir:
  - Ausência de COGS (custo do produto vendido) no P&L
  - Falta de integração com TikTok Shop
  - Preocupações de segurança no armazenamento de credenciais do Supabase (chaves de API, tokens de acesso aos marketplaces)

## 3. Escopo da investigação

Faça o levantamento completo de:

**Banco de dados**
- Todas as tabelas, views e materialized views (schema `public` e demais schemas relevantes)
- Colunas, tipos, chaves primárias/estrangeiras, índices
- Políticas de RLS (Row Level Security) por tabela
- Triggers e funções de banco (`pg_catalog`, `information_schema`)
- Relação entre tabelas de ingestão bruta (vindas do pipeline Python) e tabelas/views de consumo (usadas pelo dashboard)

**Edge Functions**
- Lista completa de funções, o que cada uma faz, quais tabelas lê/escreve
- Quais chamam APIs externas (marketplace, gateways de pagamento, etc.) e com que credenciais
- Agendamentos (cron jobs) existentes
- Tratamento de erros, retries, idempotência

Se você tiver acesso direto ao projeto (via MCP, CLI do Supabase ou ferramenta de execução SQL), use-o para consultar o schema real. Se não tiver, peça que eu forneça:
- Dump do schema: `supabase db dump --schema public --data-only=false`
- Lista de funções: `supabase functions list` (e o código-fonte de cada uma)
- Export das políticas de RLS: consulta em `pg_policies`

Se algo estiver ambíguo ou incompleto para uma conclusão segura, **pergunte antes de recomendar uma exclusão ou mudança estrutural**.

## 4. Cobertura de dados exigida (checklist de negócio)

Avalie se o banco atual cobre — de forma correta, não duplicada e extensível a múltiplos marketplaces e múltiplos vendedores — os seguintes domínios:

1. **Catálogo e listagens**: produtos, SKUs/variações, categorias, status de anúncio, imagens/atributos relevantes
2. **Preço e promoções**: preço regular, preço promocional, % de desconto, cupons, período de vigência da promoção
3. **Vendas e pedidos**: pedidos, itens do pedido, status, devoluções/reembolsos (já existe módulo `returns` — validar cobertura)
4. **Estoque**: saldo por SKU/variação, reservas, histórico de movimentação
5. **Tráfego e engajamento**: visualizações (views), cliques, impressões, adição ao carrinho, taxa de conversão — orgânico vs. pago
6. **Ads / mídia paga**: investimento por campanha/grupo de anúncio, CPC, CPA, ROAS/ACOS, impressões e cliques atribuídos a ads
7. **Financeiro**: taxas de marketplace (comissão), taxas de pagamento/gateway, taxas logísticas, impostos, COGS, margem líquida, estrutura de P&L completa
8. **Carteira/repasses**: saldo, liquidações, prazos de repasse (módulo `wallet` — validar cobertura)
9. **Multi-tenant e segurança**: como contas de vendedores são isoladas (RLS por `tenant_id`/`seller_id`), como credenciais de API de cada vendedor são armazenadas (criptografia, cofre de segredos vs. coluna em texto plano), escalabilidade da estrutura para novos marketplaces sem redesenho de schema

Para cada item acima, classifique como: ✅ coberto corretamente / ⚠️ coberto parcialmente ou com problema / ❌ ausente.

## 5. O que eliminar

Identifique e liste, com justificativa:
- Tabelas, views ou colunas sem uso (não referenciadas por nenhuma Edge Function, dashboard ou query conhecida)
- Dados duplicados ou que poderiam ser derivados/calculados em vez de armazenados
- Edge Functions obsoletas, duplicadas ou sem chamadores
- Estruturas que só fazem sentido no modelo "loja única" e vão travar a expansão multi-tenant

Para cada item, sugira a ação: remover, arquivar, consolidar ou manter com ressalva — sem executar a ação.

## 6. Formato do relatório final

Entregue em Markdown, com as seções:

1. **Resumo executivo** (3-5 bullets com os achados mais críticos)
2. **Mapa do schema atual** (tabela por tabela: propósito, principais colunas, quem lê/escreve)
3. **Mapa das Edge Functions** (função por função: propósito, gatilho, dependências)
4. **Checklist de cobertura de negócio** (a lista da seção 4, com status ✅/⚠️/❌ e explicação)
5. **Itens redundantes/desnecessários** (com ação sugerida)
6. **Lacunas críticas e proposta de schema/colunas/funções para preenchê-las**
7. **Avaliação de segurança e prontidão multi-tenant**
8. **Plano de ação priorizado** (quick wins vs. mudanças estruturais, em ordem de impacto x esforço)

## 7. Regras

- Não execute nenhuma alteração no banco ou nas funções — apenas investigue e recomende.
- Não sugira `DROP` definitivo sem marcar claramente como "requer validação humana antes de executar".
- Onde a evidência for insuficiente para concluir algo com segurança, diga isso explicitamente em vez de assumir.
