# Plano de Correção - Analisador de Anúncios

Data: 2026-07-01
Projeto: JV Imports Control Tower

## Diagnóstico Atual

A aba Analisador de Anúncios está misturando dados de catálogo, vendas e ads sem uma camada única de performance por produto. Os problemas encontrados são estes:

1. A tabela Auditoria e Saúde de Anúncios usa `shopee_products.sales`, campo que está zerado ou desatualizado para vários produtos.
2. A view `vw_product_performance_summary` hoje apenas replica `shopee_products`; ela não agrega `shopee_order_items` + `shopee_orders`, embora exista a view diária `vw_product_performance_daily` com vendas reais por item.
3. A view `shopee_ads_daily` define `item_id` como `NULL`, pois vem de `shopee_ads_daily_performance`, que é agregada por loja/dia. Portanto, ads por produto ainda não existe como dado real no banco.
4. A cor de `Otimizações Recomendadas` é calculada separadamente do `Listing Score`. Isso permite que itens com texto Excelente apareçam com cores diferentes.
5. O modal do produto trata produtos com variações como texto de preço múltiplo, em vez de oferecer seletor de variação.
6. A aba Mídia & Atributos assume um único formato de JSON para atributos (`display_attribute_name` e `display_value_name`), causando `undefined` quando a Shopee retorna outra estrutura.
7. A aba Vendas & Ads busca vendas por produto manualmente, com limite de 500 pedidos, e busca ads por `item_id` numa view que não tem `item_id`; por isso os gráficos ficam zerados.
8. O Smart Diagnosis está raso: olha conversão, desconto e favoritos, mas não cruza margem, estoque, rating, mídia, preço, variação e ads.

Exemplos citados para validação visual:

- `AU-EA-ESP-PN-CV-2X` - Kit com 2 Aplicador de Pretinho para Pneus
- `CA-VDP-RD-80-PT-3X` - Kit com 3 Veda Portas Rodinho 80cm Adesivo + Velcro

Esses itens devem ter score, cor e recomendação coerentes entre si.

## Objetivo da Correção

Transformar o Analisador de Anúncios em uma tela confiável de auditoria comercial por produto, com:

- vendas reais por produto e variação;
- status ativo/inativo do anúncio;
- ordenação por coluna;
- busca por nome, SKU e ID;
- filtros por status, score, tipo de produto e performance;
- modal com seletor de variação;
- cálculo de lucro final configurável;
- diagnóstico acionável e priorizado;
- dados ausentes marcados como ausência, não como zero falso.

## Fase 1 - Correções de Dados e Tabela

### 1. Corrigir a fonte de vendas por produto

Criar ou substituir `vw_product_performance_summary` para agregar vendas reais:

- fonte de catálogo: `shopee_products`;
- fonte de variações: `shopee_variations`;
- fonte de vendas: `vw_product_performance_daily` ou diretamente `shopee_order_items` + `shopee_orders`;
- métricas mínimas: `orders_count`, `units_sold`, `gross_revenue`, `last_order_date`, `sales_7d`, `sales_15d`, `sales_30d`.

A tabela do front deve consumir essa view em vez de `shopee_products` puro.

### 2. Ajustar ordem e conteúdo das colunas

Nova ordem recomendada:

1. Nome do Anúncio
2. Imagem
3. Status
4. Tipo / SKU
5. Vendas
6. Receita
7. Visualizações
8. Conversão
9. Nota
10. Listing Score
11. Otimizações Recomendadas

Regra de SKU:

- se `has_model = false`, mostrar `item_sku`;
- se `has_model = true`, mostrar `Produto com Variações`;
- no modal, o seletor mostra cada `model_sku` e `model_name`.

Regra de status:

- usar `item_status` da Shopee;
- exibir badge `Ativo`, `Inativo`, `Em revisão`, `Deletado/Arquivado` conforme valores reais retornados.

### 3. Ordenação, filtros e busca

Implementar estado local:

- `listingSearchTerm`;
- `listingStatusFilter`;
- `listingScoreFilter`;
- `listingTypeFilter`;
- `listingSort = { key, direction }`.

Filtros mínimos:

- Status: Todos, Ativos, Inativos;
- Score: Excelente, Bom, Ruim;
- Tipo: Produto único, Produto com variações;
- Performance: Com vendas, Sem vendas, Com alerta.

Busca deve procurar em:

- `item_name`;
- `item_sku`;
- `item_id`;
- SKUs das variações.

### 4. Corrigir cor das recomendações

Criar função única:

```js
function getListingScoreMeta(score) {
  if (score >= 80) return { label: 'Excelente', className: 'excellent' };
  if (score >= 60) return { label: 'Bom', className: 'good' };
  return { label: 'Crítico', className: 'poor' };
}
```

A coluna `Listing Score` e a coluna `Otimizações Recomendadas` devem usar a mesma `className`.

## Fase 2 - Modal com Variações e Lucro Final

### 1. Seletor de variação

Ao abrir o produto:

- buscar todas as variações em `shopee_variations` por `item_id`;
- se houver variações, mostrar um select no topo da aba Visão Geral;
- ao trocar a variação, atualizar preço, SKU, estoque, custo, margem e lucro;
- se não houver variação, manter o produto único.

### 2. Cálculo de lucro final

Criar cálculo por produto/variação:

```text
preco_venda
- taxa_shopee_percentual
- taxa_shopee_fixa
- custo_ads_estimado_ou_manual
- imposto_percentual
- custo_produto_upseller
= lucro_final_estimado
```

Campos necessários:

- preço atual: Shopee produto/variação;
- custo do produto: `vw_upseller_stock_planning.average_cost` ou `upseller_stock_snapshot.average_cost`;
- ads histórico: enquanto não houver ads por item real, usar rateio por participação da receita e marcar como estimado;
- taxa Shopee percentual: configurável;
- taxa Shopee fixa: configurável;
- imposto percentual: configurável;
- custo ads manual: opcional, por produto/variação.

### 3. Nova aba de configurações financeiras

Criar uma nova aba do sistema: `Configurações Financeiras`.

Tabelas sugeridas:

- `commerce_fee_settings`: taxas padrão por conta/loja;
- `product_cost_overrides`: custo manual por SKU/model_sku;
- `ads_cost_overrides`: custo ads manual por item/model/período;
- `tax_settings`: imposto padrão por conta/loja.

Campos de `commerce_fee_settings`:

- `account_id`;
- `shop_id`;
- `marketplace`;
- `commission_percent`;
- `fixed_fee_amount`;
- `service_fee_percent`;
- `tax_percent`;
- `valid_from`;
- `valid_to`;
- `is_default`.

## Fase 3 - Smart Diagnosis Relevante

Substituir checklist simples por diagnóstico com severidade:

- `critical`: perde dinheiro, anúncio ativo sem estoque, conversão muito baixa com alto tráfego;
- `warning`: imagem fraca, nota baixa, variação sem custo, preço sem margem;
- `opportunity`: boa margem + baixo tráfego, alto favorito + baixa conversão, ROAS positivo com orçamento baixo;
- `ok`: sem ação imediata.

Regras recomendadas:

- conversão = unidades vendidas / visualizações;
- margem final menor que 0 = alerta crítico;
- margem final entre 0 e 10% = alerta;
- produto sem custo UPSeller = alerta de dados;
- produto ativo sem estoque = crítico;
- rating abaixo de 4.5 com vendas recentes = alerta de reputação;
- fotos abaixo de 800px = alerta de mídia;
- atributos obrigatórios ausentes = alerta de ficha técnica;
- ads com gasto e sem venda = alerta de campanha;
- vendas orgânicas boas e ads zerado = oportunidade de teste.

Cada diagnóstico deve ter:

- título;
- motivo com número;
- impacto esperado;
- ação recomendada;
- prioridade.

## Fase 4 - Mídia & Atributos

Criar parser tolerante para atributos Shopee:

- tentar `display_attribute_name`;
- fallback para `attribute_name`;
- fallback para `name`;
- valor: `display_value_name`, `value_unit`, `original_value_name`, `value`, arrays de `attribute_value_list`;
- se não houver valor, mostrar `Não informado`, nunca `undefined`.

Para fotos:

- aceitar `images_json` como array de URLs, array de objetos ou string JSON;
- validar tamanho mínimo;
- marcar capa ausente;
- destacar quantidade de imagens.

Para vídeo:

- aceitar `video_info_json` em múltiplos formatos;
- mostrar duração/resolução quando disponível;
- marcar ausente sem erro visual.

## Fase 5 - Vendas & Ads

### Vendas

Usar `vw_product_performance_daily` por `item_id`, `model_id` e período.

Métricas:

- unidades vendidas;
- pedidos;
- receita bruta;
- ticket médio;
- curva diária;
- comparação com período anterior.

### Ads

Hoje não há dado real por produto porque `shopee_ads_daily.item_id` é `NULL`.

Caminho correto:

1. Verificar endpoints Shopee Ads disponíveis para performance por campanha, anúncio, item ou keyword.
2. Ajustar Edge Function `shopee-sync` para salvar granularidade por produto quando a API permitir.
3. Criar tabela `shopee_ads_product_daily`.
4. Criar view `vw_product_ads_daily`.
5. Atualizar modal e tabela para consumir essa nova view.

Enquanto a API granular não estiver implementada:

- mostrar ads por produto como `Estimado`;
- ratear custo por participação de receita ou unidades vendidas;
- nunca exibir como dado real.

## Fase 6 - Ajuste Visual e UX

- Tabela deve ter toolbar no topo com busca e filtros.
- Cabeçalhos clicáveis devem mostrar ícone de ordenação.
- Estado vazio deve dizer exatamente o que falta: vendas, ads, custo ou API.
- Produtos críticos devem aparecer primeiro por padrão.
- Modal deve ter cards compactos e não repetir múltiplos preços em texto.
- Toda cor de score deve vir de uma única função.
- Light/dark mode deve ser testado na tabela, modal, inputs, selects e gráficos.

## Critérios de Aceite

1. Produtos com vendas recentes deixam de aparecer zerados quando há registros em `shopee_order_items`.
2. Produtos sem vendas aparecem com traço ou `0 vendas`, mas com indicação clara de ausência real.
3. `AU-EA-ESP-PN-CV-2X` e `CA-VDP-RD-80-PT-3X` aparecem com cor coerente entre score e recomendação.
4. Produto com variação mostra `Produto com Variações` na tabela e seletor no modal.
5. Produto único mostra SKU direto na tabela.
6. Atributos não exibem `undefined`.
7. Vendas & Ads mostra vendas reais; ads só aparece como real quando houver granularidade por produto.
8. Lucro final é calculado com taxas, imposto, ads e custo UPSeller.
9. Busca, filtro e ordenação funcionam sem recarregar a página.
10. Modo claro e escuro não quebram textos, botões, tabelas, modal ou gráficos.

## Ordem de Implementação Recomendada

1. Corrigir views de performance por produto.
2. Atualizar carregamento de dados do front para usar a view corrigida.
3. Recriar tabela com busca, filtros e ordenação.
4. Corrigir score/recomendações.
5. Corrigir parser de atributos e mídia.
6. Implementar seletor de variações no modal.
7. Implementar configurações financeiras e cálculo de lucro.
8. Implementar ads granular na Edge Function, ou marcar rateio como estimado.
9. Melhorar Smart Diagnosis.
10. Fazer QA visual em dark/light mode.
