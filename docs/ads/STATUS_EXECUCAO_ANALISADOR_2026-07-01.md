# Status de Execução - Analisador de Anúncios

Data: 2026-07-01
Projeto: JV Imports Control Tower

## Decisão de escopo

Nesta rodada, **auth não foi alterado**. Login, sessão, usuários, senhas, RLS de autenticação e credenciais demo ficaram fora do escopo por decisão operacional.

## Executado no Supabase

- Recriada a view `public.vw_product_performance_summary` para consumir vendas reais por produto.
- Recriada a view `public.vw_product_variation_performance_summary` para vendas/custos por variação.
- Criadas tabelas de suporte financeiro:
  - `public.commerce_fee_settings`
  - `public.product_cost_overrides`
  - `public.ads_cost_overrides`
- Inserida configuração padrão Shopee:
  - comissão percentual: `14%`
  - taxa fixa: `R$ 4,00`
  - taxa de serviço: `0%`
  - imposto: `0%`
- Criados índices de apoio para lookup por produto/modelo/loja.

## Validação de dados

- `vw_product_performance_summary`: 74 produtos.
- `vw_product_variation_performance_summary`: 176 variações.
- `vw_product_performance_daily` nos últimos 30 dias: 132 linhas, 259 unidades vendidas e R$ 7.823,66 de receita bruta.
- `shopee_ads_daily`: 259 linhas, R$ 13.906,77 de despesa total, porém 0 linhas com `item_id` preenchido.

Conclusão: vendas por produto existem e foram conectadas. Ads por produto ainda não existe como dado real; a interface agora sinaliza isso em vez de exibir zeros falsos.

## Executado no GitHub/front

Arquivos adicionados:

- `ads-analyzer.js`
- `ads-analyzer.css`
- `docs/ads/STATUS_EXECUCAO_ANALISADOR_2026-07-01.md`

Arquivos alterados:

- `theme-toggle.js`
- `netlify.toml`

`hotfix.js` e arquivos de auth não foram alterados.

## Implementações entregues

- Tabela Auditoria e Saúde de Anúncios passa a usar `vw_product_performance_summary`.
- Colunas reorganizadas com Nome do Anúncio primeiro.
- SKU só aparece para produto único; produtos com variação mostram `Produto com Variações`.
- Status do anúncio exibido como badge.
- Busca por anúncio, SKU ou ID.
- Filtros por status, score, tipo e performance.
- Ordenação por coluna.
- Cor de `Listing Score` e `Otimizações Recomendadas` usa a mesma função de score.
- Modal do produto recriado com abas:
  - Visão geral
  - Smart Diagnosis
  - Mídia & Atributos
  - Vendas & Ads
  - Config. Financeiras
- Produtos com variações usam seletor de variação.
- Cálculo de lucro final com preço, custo UPSeller/manual, Ads manual, comissão, taxa fixa, serviço e imposto.
- Parser tolerante para atributos, evitando `undefined`.
- Vendas & Ads usa vendas reais por produto e marca Ads granular como indisponível quando não há `item_id`.
- Estilos adaptados para dark/light mode usando variáveis existentes.

## Deploy

O Netlify já serve os novos assets em produção:

- `https://ecommerce-control-jv.netlify.app/ads-analyzer.js?v=20260701-ads`
- `https://ecommerce-control-jv.netlify.app/ads-analyzer.css?v=20260701-ads`
- `https://ecommerce-control-jv.netlify.app/theme-toggle.js?v=20260701-theme`

Validação de sintaxe por parser:

- `ads-analyzer.js`: OK
- `theme-toggle.js`: OK

## Pendências reais

1. Implementar granularidade de Shopee Ads por produto/campanha na Edge Function quando o endpoint disponível permitir preencher `item_id`.
2. Persistir configurações financeiras no Supabase com RLS/auth adequado, quando auth voltar ao escopo.
3. Fazer QA visual manual logado no painel para conferir modais, filtros e tabela com dados reais do usuário.
