# JV Imports Control Tower - Plano Robusto de Implementacao para Antigravity

## 1. Objetivo do Plano

Transformar o projeto `JVImports/E-commerce-Control` em uma plataforma SaaS robusta para controle e inteligencia de e-commerce, inicialmente focada em Shopee, com login por usuario, isolamento de dados por conta/loja, sincronizacao segura via API, metricas confiaveis de produto, anuncios, estoque, financeiro e recomendacoes operacionais acionaveis.

Este plano deve ser executado pelo Antigravity em fases, com prioridade em confiabilidade dos dados, seguranca multi-tenant e qualidade analitica antes de melhorias visuais.

## 2. Diagnostico Atual

### Stack atual

- Frontend: SPA estatica com `index.html`, `styles.css`, `app.js`
- Hospedagem: Netlify
- Backend e dados: Supabase Postgres, Auth, RLS e Edge Function
- Integracao: Shopee API via Edge Function `shopee-sync`
- Modelo atual: iniciado como painel interno, evoluindo para SaaS multi-tenant

### Dados reais observados no Supabase

- 1 loja conectada
- 74 produtos
- 176 variacoes
- 6.806 pedidos
- R$ 233.972,08 em pedidos historicos
- 5.546 registros de escrow
- R$ 12.877,60 em Ads
- ROAS direto historico aproximado de 6,78
- 49 devolucoes
- 276 linhas de estoque
- 100.850 logs de sincronizacao

### Problemas prioritarios

1. Dados de pedidos e Ads aparentam estar parados em maio/2026.
2. Ranking de produtos usa `shopee_products.sales`, mas este campo esta zerado em muitos produtos.
3. DRE atual mistura repasse liquido, taxas e receita, entao ainda nao serve como lucro real por produto.
4. `landed_cost_entries` esta vazio; CMV usa fallback fragil.
5. Estoque tem alto volume de SKUs nao conciliados com produtos Shopee.
6. Existem politicas RLS permissivas e alertas de seguranca no Supabase.
7. Varias chaves e `onConflict` nao consideram `shop_id`, o que pode quebrar multi-loja.
8. Frontend tem configuracoes sensiveis no `localStorage`, excesso de HTML inline e regras de negocio demais no browser.

## 3. Norte de Produto

A plataforma deve responder diariamente:

- O que vender mais?
- O que parar de anunciar?
- O que comprar antes de romper?
- Qual produto da lucro real e qual so gera faturamento?
- Qual SKU esta queimando caixa?
- Qual anuncio tem trafego mas nao converte?
- Qual loja performa melhor?
- Qual campanha, produto ou categoria merece investimento?
- Quais dados estao atrasados ou incompletos?

O sistema nao deve ser apenas um dashboard. Deve funcionar como uma central de decisoes.

## 4. Arquitetura-Alvo SaaS Multi-Tenant

### Entidades principais

Criar ou revisar as seguintes entidades:

- `accounts`
  - representa a empresa/cliente
  - campos: `id`, `name`, `owner_user_id`, `plan`, `status`, `created_at`

- `account_members`
  - vincula usuarios a empresas
  - campos: `account_id`, `user_id`, `role`
  - roles sugeridas: `owner`, `admin`, `operator`, `viewer`

- `shops`
  - representa lojas conectadas a marketplaces
  - campos: `id`, `account_id`, `marketplace`, `external_shop_id`, `shop_name`, `status`, `created_at`, `updated_at`
  - substituir gradualmente `shopee_shops` ou criar compatibilidade

- `shop_credentials`
  - armazenar tokens criptografados, nunca expor ao frontend
  - campos: `shop_id`, `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `scopes`, `last_refresh_at`

- `sync_runs`
  - execucoes de sync por loja/modulo
  - campos: `id`, `account_id`, `shop_id`, `module`, `status`, `started_at`, `finished_at`, `records_read`, `records_written`, `error_message`

- `sync_cursors`
  - estado incremental por loja/modulo
  - campos: `shop_id`, `module`, `cursor_key`, `cursor_value`, `updated_at`

### Regra multi-tenant obrigatoria

Todas as tabelas de negocio devem possuir `account_id` e, quando aplicavel, `shop_id`.

Tabelas Shopee devem ter chaves unicas compostas:

- Produtos: `(shop_id, item_id)`
- Variacoes: `(shop_id, model_id)`
- Pedidos: `(shop_id, order_sn)`
- Itens de pedido: `(shop_id, line_key)`
- Escrow: `(shop_id, order_sn)`
- Ads diario: `(shop_id, performance_date, item_id/campaign_id quando disponivel)`
- Wallet: `(shop_id, transaction_id)`
- Returns: `(shop_id, return_id)`

Nunca usar somente `item_id`, `order_sn`, `model_id` ou `performance_date` como chave global.

## 5. Login e Acesso para Outras Pessoas

### Fluxo de cadastro

1. Usuario cria conta com e-mail e senha via Supabase Auth.
2. Sistema cria automaticamente uma `account`.
3. Usuario vira `owner` em `account_members`.
4. Usuario e direcionado para onboarding:
   - nome da empresa
   - marketplace principal
   - conectar primeira loja
   - configurar custos basicos

### Login

1. Usuario autentica via Supabase Auth.
2. Frontend busca `account_members`.
3. Se usuario pertence a uma unica conta, entra direto.
4. Se pertence a mais de uma, exibir seletor de empresa.
5. Todas as consultas devem ser filtradas pelo `account_id` ativo.

### Permissoes

- `owner`: gerencia plano, membros, lojas, credenciais e exclusoes.
- `admin`: gerencia lojas, syncs, dados e configuracoes.
- `operator`: roda syncs, importa planilhas e executa tarefas.
- `viewer`: apenas leitura.

### RLS esperado

Toda tabela deve permitir acesso apenas quando:

```sql
account_id in (
  select account_id
  from account_members
  where user_id = (select auth.uid())
)
```

Para tabelas por loja:

```sql
shop_id in (
  select s.id
  from shops s
  join account_members am on am.account_id = s.account_id
  where am.user_id = (select auth.uid())
)
```

Evitar politicas `USING (true)` e `WITH CHECK (true)`.

## 6. Conexao com Shopee API

### Opcoes de conexao

#### Opcao A - OAuth recomendado

Fluxo ideal semelhante a ERPs:

1. Usuario clica em "Conectar loja Shopee".
2. Frontend chama Edge Function `GET /oauth/start`.
3. Edge Function gera URL assinada da Shopee.
4. Usuario autoriza no portal Shopee.
5. Shopee redireciona para `/oauth/callback`.
6. Edge Function troca `code` por `access_token` e `refresh_token`.
7. Tokens sao armazenados no banco de forma segura.
8. Usuario informa apelido da loja.
9. Sistema executa sync inicial.

Importante: confirmar endpoints e parametros na documentacao oficial Shopee Open Platform no momento da implementacao.

#### Opcao B - Insercao manual temporaria

Permitir somente em modo admin/avancado, com avisos claros:

- `shop_id`
- `access_token`
- `refresh_token`

Esta opcao deve ser removida ou restrita em producao, pois expor token no browser aumenta risco operacional.

### Edge Functions sugeridas

- `shopee-oauth-start`
- `shopee-oauth-callback`
- `shopee-sync`
- `shopee-refresh-token`
- `sync-scheduler`

### Regras de token

- Refresh automatico antes de expirar.
- Nunca retornar token ao frontend.
- Registrar `last_refresh_at`.
- Alertar se token falhar ou loja perder autorizacao.

## 7. Sincronizacao de Dados

### Modulos

- Produtos e variacoes
- Pedidos e itens
- Escrow e financeiro
- Wallet
- Devolucoes
- Ads balance
- Ads daily performance
- Reviews
- Vouchers
- Logistics
- Account health

### Modelo de sync

Cada sync deve:

1. Criar `sync_run`.
2. Ler cursor incremental.
3. Buscar dados da API.
4. Normalizar payload.
5. Fazer upsert com chave composta por `shop_id`.
6. Atualizar cursor.
7. Atualizar `sync_run`.
8. Atualizar `data_freshness`.

### Freshness

Criar view `vw_data_freshness` com:

- ultima sincronizacao por modulo
- atraso em horas
- status: `fresh`, `warning`, `stale`, `failed`

Exibir isso no topo do painel. Sem dado fresco, o dashboard deve avisar.

### Cron

Usar Supabase Cron ou agendador externo:

- Produtos: 1 a 2 vezes ao dia
- Pedidos: a cada 30 ou 60 minutos
- Escrow: a cada 60 minutos
- Ads: diariamente e reforco de ultimos 7 dias
- Estoque: manual ou via importacao recorrente
- Reviews: diariamente
- Token refresh: sob demanda antes de chamadas

## 8. Modelo Analitico-Alvo

### Views obrigatorias

Criar views SQL e reduzir calculos no frontend:

- `vw_business_scorecard`
  - GMV, receita liquida, pedidos, ticket medio, margem, Ads, ROAS, TACOS, devolucoes

- `vw_product_unit_economics`
  - SKU, item_id, unidades, GMV, escrow alocado, taxas, Ads alocado, CMV, margem bruta, margem de contribuicao

- `vw_product_performance_7_30_90`
  - vendas, GMV, crescimento, queda, giro e curva ABC

- `vw_ads_product_performance`
  - gasto, GMV direto, GMV amplo, ROAS, TACOS, CPC, CTR, conversoes

- `vw_stock_risk`
  - estoque atual, venda media diaria, cobertura, lead time, sugestao de compra, risco

- `vw_sku_reconciliation`
  - SKUs Shopee vs UPSeller vs custos

- `vw_decision_tasks`
  - tarefas priorizadas por impacto financeiro

### Metricas essenciais

Financeiro:

- GMV bruto
- Receita liquida recebida
- Comissoes
- Taxas de servico
- Voucher do vendedor
- Frete subsidiado
- Reembolsos
- CMV
- Ads
- Lucro bruto
- Margem de contribuicao
- Margem liquida estimada

Ads:

- Investimento
- ROAS direto
- ROAS amplo
- TACOS
- CTR
- CPC
- CPA
- Conversao
- Payback estimado

Produto:

- Unidades vendidas
- GMV
- Receita liquida
- Margem por SKU
- Giro
- Estoque disponivel
- Cobertura
- Avaliacao
- Taxa de devolucao
- Curva ABC

Estoque:

- Cobertura em dias
- Demanda media
- Sugestao de compra
- Ruptura provavel
- Excesso de estoque
- Valor parado

## 9. Custo e CMV

Prioridade alta: substituir fallback de `40% do preco`.

### Implementar

- Tela de cadastro/importacao de custo por SKU.
- Importacao de landed cost.
- Conciliacao SKU Shopee x SKU interno.
- Historico de custo por periodo.
- Custo de kit por composicao.

### Tabelas sugeridas

- `sku_costs`
  - `account_id`, `sku`, `cost_type`, `unit_cost`, `currency`, `valid_from`, `valid_to`

- `sku_components`
  - para kits
  - `kit_sku`, `component_sku`, `component_qty`

- `sku_aliases`
  - resolver divergencias de SKU entre Shopee, UPSeller e importacao

## 10. UX e Design

### Direcao visual

Trocar gradualmente o visual excessivamente "glassmorphic" por interface operacional mais densa:

- Mais tabelas analiticas
- Filtros claros
- Menos cards decorativos
- Mais comparativos
- Cores com significado operacional

### Navegacao alvo

- Dashboard
- Produtos
- Ads
- Financeiro
- Estoque
- Tarefas
- Sincronizacao
- Lojas
- Configuracoes

### Dashboard principal

Primeira tela deve mostrar:

- Status de dados
- GMV, lucro estimado, margem, Ads, TACOS, pedidos
- Alertas criticos
- Top decisoes do dia
- Produtos para escalar
- Produtos para pausar
- Produtos para repor
- Produtos para liquidar

### Produtos

Tabela com:

- SKU
- Produto
- Loja
- Vendas 7/30/90
- GMV
- Margem
- Estoque
- Cobertura
- Ads
- ROAS
- Acao recomendada

### Ads

Tabela com:

- Campanha/produto
- Gasto
- GMV direto
- GMV amplo
- ROAS
- TACOS
- Conversao
- Status recomendado: escalar, manter, reduzir, pausar

## 11. Melhorias Tecnicas no Frontend

### Curto prazo

- Remover credenciais Supabase do fluxo de usuario final.
- Configurar Supabase URL e anon key em variaveis de ambiente Netlify.
- Mover estilos inline para `styles.css`.
- Criar camada `api.js` para chamadas ao Supabase e Edge Functions.
- Criar `metrics.js` apenas para formatacao simples, nao calculos complexos.
- Remover modal duplicado de produto.
- Melhorar estados de loading, erro e dados vazios.

### Medio prazo

Migrar para Vite + React ou manter vanilla com modularizacao forte. Recomendacao: Vite + React + TypeScript, porque a complexidade de produto, filtros, tabelas e permissoes vai crescer.

## 12. Segurança

### Corrigir imediatamente

- Remover politicas anonimas de escrita.
- Revisar `sync_state`, `upseller_stock_imports`, `upseller_stock_snapshot`.
- Revogar execucao publica de funcoes `SECURITY DEFINER` nao necessarias.
- Definir `search_path` fixo em funcoes SQL.
- Ativar leaked password protection no Supabase Auth.
- Remover tokens manuais do browser em producao.
- CORS restrito ao dominio Netlify em producao.

### Performance

- Indexar todos os `user_id`, `account_id`, `shop_id`.
- Indexar datas de pedidos, Ads e sync.
- Corrigir RLS com `(select auth.uid())`.
- Remover politicas permissivas duplicadas.
- Criar views agregadas para evitar calculo pesado no browser.

## 13. Plano de Execucao por Fases

### Fase 0 - Auditoria e backup

- Exportar schema atual.
- Registrar migrations existentes.
- Fazer backup antes de alterar RLS/chaves.
- Mapear views atuais e dependencias.

Critério de aceite:

- Backup validado.
- Lista de tabelas, policies e views documentada.

### Fase 1 - Fundacao SaaS

- Criar `accounts`, `account_members`, `shops`, `shop_credentials`, `sync_runs`, `sync_cursors`.
- Migrar `shopee_shops` para `shops`.
- Adicionar `account_id` nas tabelas principais.
- Criar RLS multi-tenant correta.

Critério de aceite:

- Dois usuarios diferentes nao veem dados um do outro.
- Owner consegue convidar/ver membros.
- Loja pertence a uma conta.

### Fase 2 - Shopee OAuth seguro

- Implementar fluxo OAuth start/callback.
- Armazenar tokens somente no backend.
- Implementar refresh automatico.
- Remover dependencia de tokens manuais no frontend.

Critério de aceite:

- Usuario conecta loja clicando em autorizar.
- Token renova sozinho.
- Frontend nunca recebe token Shopee.

### Fase 3 - Sync confiavel

- Corrigir chaves compostas com `shop_id`.
- Criar sync incremental por modulo.
- Criar cron.
- Criar `vw_data_freshness`.
- Reduzir excesso de logs DEBUG.

Critério de aceite:

- Pedidos/Ads atualizam automaticamente.
- Dashboard mostra atraso por modulo.
- Sync nao sobrescreve dados de outra loja.

### Fase 4 - Modelo analitico real

- Criar views de scorecard, produto, Ads, estoque e tarefas.
- Recriar ranking de produtos por pedidos reais.
- Implementar custo por SKU.
- Implementar conciliacao de SKUs.

Critério de aceite:

- Produto mostra GMV, unidades, Ads, CMV e margem.
- Estoque usa demanda real.
- Ranking nao depende de `shopee_products.sales`.

### Fase 5 - Novo dashboard operacional

- Criar tela de decisoes do dia.
- Criar tela Produtos.
- Criar tela Ads.
- Melhorar Financeiro/DRE.
- Melhorar Estoque.

Critério de aceite:

- Usuario consegue saber o que escalar, pausar, repor e liquidar.
- Todas as recomendacoes mostram motivo e impacto.

### Fase 6 - Preparacao para escala

- Melhorar planos/limites.
- Criar logs e auditoria de acoes.
- Criar onboarding guiado.
- Criar documentacao para suporte.
- Criar testes e monitoramento.

Critério de aceite:

- Novo cliente consegue criar conta, conectar loja e ver primeiros dados.
- Operacao suporta multiplas contas e lojas.

## 14. Backlog de Features Futuras

- Integracao TikTok Shop
- Integracao Mercado Livre
- Importacao automatica UPSeller
- Alertas por e-mail/WhatsApp
- Previsao de demanda
- Recomendacao automatica de preco
- Simulador de margem
- Painel de fluxo de caixa
- Analise de reviews com IA
- Exportacao CSV/Excel
- API publica para parceiros

## 15. Definicao de Pronto

Uma entrega so deve ser considerada pronta quando:

- Tem migration versionada.
- Tem RLS validada.
- Tem teste manual documentado.
- Nao expõe tokens no frontend.
- Funciona com pelo menos duas contas isoladas.
- Funciona com pelo menos duas lojas.
- O dashboard informa freshness dos dados.
- Os numeros batem com consultas SQL de validacao.

## 16. Prioridade Imediata Recomendada

1. Corrigir RLS e seguranca.
2. Corrigir chaves compostas por `shop_id`.
3. Implementar freshness e sync automatico.
4. Recalcular produto por pedidos reais.
5. Criar CMV real por SKU.
6. Refazer dashboard para decisoes.

Este plano deve ser tratado como guia mestre de implementacao. Sempre que houver duvida entre aparencia e confiabilidade, priorizar confiabilidade dos dados.
