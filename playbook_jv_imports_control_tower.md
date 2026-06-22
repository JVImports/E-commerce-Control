# Playbook — JV Imports Control Tower

## 1. Objetivo do projeto

Criar um sistema web privado chamado **JV Imports Control Tower**, para centralizar a gestão da empresa JV Imports, com foco em e-commerce de produtos importados vendidos em marketplaces.

O sistema deve ajudar o proprietário a tomar decisões rápidas sobre financeiro, estoque, reposição, importação, produtos, anúncios e criativos, reduzindo dependência de planilhas soltas e decisões feitas “de cabeça”.

O objetivo principal do sistema é responder diariamente:

> Onde estou ganhando dinheiro, onde estou perdendo dinheiro e o que preciso fazer agora?

---

## 2. Contexto do negócio

A JV Imports é uma empresa de e-commerce focada em produtos importados, com venda em marketplaces. O proprietário também trabalha como CLT, então o sistema precisa reduzir trabalho manual, organizar prioridades e automatizar análises.

### Canais e fontes de dados

1. **Shopee**
   - Dados podem ser solicitados via API.
   - Deve ser tratada como a primeira integração automática.
   - Dados esperados: pedidos, produtos, status, receita, taxas quando disponíveis, anúncios quando disponível, SKU e quantidade vendida.

2. **TikTok Shop / TikTok**
   - Ainda não há API disponível para uso neste projeto.
   - Dados devem entrar por upload manual de relatórios CSV/XLSX.
   - O sistema deve estar preparado para futura integração por API.

3. **UPSeller**
   - Fonte principal para estoque, custo de compra, composição de kits, SKUs, produtos e variações.
   - Os dados serão exportados via Excel.
   - O sistema precisa ter importador de planilhas XLSX/CSV.

4. **Dados manuais**
   - Alguns custos precisarão ser cadastrados manualmente no começo.
   - Exemplos: custo de embalagem, imposto padrão, taxa estimada, custo de importação, frete internacional rateado, custo de despachante, perdas e ajustes.

---

## 3. Stack definida

### Frontend

- React ou Next.js.
- Interface responsiva para desktop e celular.
- Estilo limpo, moderno e objetivo.
- Menu lateral com módulos.

### Backend/Banco

- Supabase como base principal.
- PostgreSQL como banco relacional.
- Supabase Auth para login.
- Supabase Storage para armazenar arquivos importados.
- Supabase Edge Functions ou backend separado para processamentos mais complexos.

### Hospedagem

- Netlify Free inicialmente.
- Sem domínio próprio no início.
- Futuramente pode usar domínio ou subdomínio, como `painel.jvimports.com.br`.

### Código

- GitHub como repositório.
- Codex como apoio para desenvolvimento, revisão, criação de componentes, testes e automações.

---

## 4. Premissas técnicas

1. O sistema deve começar simples, mas com arquitetura preparada para crescer.
2. A primeira versão deve aceitar upload manual de arquivos antes de depender de integrações complexas.
3. Dados de Shopee devem ter arquitetura pronta para API.
4. Dados de TikTok devem ser tratados inicialmente por importação manual.
5. Dados da UPSeller devem ser tratados como fonte operacional crítica.
6. O sistema deve ter logs de importação.
7. O sistema deve impedir duplicidade de pedidos importados.
8. O sistema deve permitir ajustes manuais quando o dado importado vier incompleto.
9. O sistema deve gerar alertas acionáveis, não apenas gráficos bonitos.
10. O sistema deve priorizar clareza, velocidade e confiabilidade.

---

## 5. Módulos do sistema

## 5.1 Dashboard principal

### Objetivo

Ser a tela inicial do negócio, mostrando os principais indicadores e alertas do dia.

### Indicadores principais

- Faturamento do mês.
- Lucro bruto estimado.
- Lucro líquido estimado.
- Margem líquida.
- Total de pedidos.
- Ticket médio.
- Gasto com anúncios.
- ROAS geral.
- Produtos com risco de ruptura.
- Produtos parados.
- Importações em andamento.
- Caixa previsto, quando o módulo financeiro evoluir.

### Alertas esperados

- SKU com estoque abaixo do ponto de reposição.
- Produto com margem negativa.
- Produto com alto faturamento e baixo lucro.
- Produto parado há muitos dias.
- Campanha com gasto alto e retorno ruim.
- Importação parada em determinada etapa.
- Produto campeão próximo de acabar.

---

## 5.2 Módulo financeiro

### Objetivo

Criar uma visão de lucro real por pedido, SKU, canal e mês.

### Funcionalidades

- Cadastro de custos por SKU.
- Cadastro de impostos e taxas padrão.
- Cálculo de margem por produto.
- Cálculo de lucro por pedido.
- DRE mensal simplificada.
- Visão de lucro por marketplace.
- Upload de relatórios financeiros.
- Rateio de Ads por SKU ou canal.
- Identificação de produtos que vendem, mas não dão lucro.

### Cálculos iniciais

Receita líquida estimada:

`receita_bruta - comissões - taxas_marketplace - impostos - frete_subsidiado - outros_descontos`

Lucro estimado por pedido:

`receita_liquida - custo_produto - embalagem - ads_rateado - outros_custos`

Margem líquida:

`lucro_liquido / receita_bruta`

### Regras importantes

- Deve ser possível alterar regras de comissão por canal.
- Deve ser possível informar manualmente custo unitário quando não vier do UPSeller.
- Deve ser possível recalcular o histórico quando um custo for corrigido.

---

## 5.3 Módulo de estoque e S&OP

### Objetivo

Evitar ruptura de produtos bons e identificar produtos parados.

### Funcionalidades

- Importar estoque da UPSeller via Excel.
- Calcular venda média diária por SKU.
- Calcular dias de cobertura.
- Calcular ponto de reposição.
- Sugerir quantidade de compra.
- Alertar produtos em risco de ruptura.
- Alertar produtos parados.
- Classificar curva ABC.
- Separar produto simples e kit.

### Fórmulas iniciais

Venda média diária:

`unidades_vendidas_periodo / número_de_dias`

Cobertura de estoque:

`estoque_atual / venda_media_diaria`

Ponto de reposição:

`venda_media_diaria * lead_time_total + estoque_segurança`

Sugestão de compra:

`demanda_prevista_no_periodo + estoque_segurança - estoque_atual - estoque_em_transito`

### Regras para kits

- Um kit deve ser composto por um ou mais SKUs componentes.
- O estoque disponível do kit deve ser calculado com base no componente limitante.
- Exemplo: se um kit usa 2 unidades do SKU A e 1 unidade do SKU B, o estoque do kit depende de quantas combinações completas podem ser montadas.

---

## 5.4 Módulo de importação

### Objetivo

Controlar todas as compras internacionais desde a cotação até a chegada no estoque.

### Funcionalidades

- Cadastro de fornecedores.
- Cadastro de pedidos de importação.
- Controle por etapa.
- Custo previsto versus custo real.
- Câmbio utilizado.
- Quantidade comprada.
- Quantidade recebida.
- Anexos/documentos.
- ETA prevista.
- Lead time real.
- Custo unitário final.

### Etapas sugeridas

1. Ideia de produto.
2. Cotação.
3. Pedido aprovado.
4. Pagamento realizado.
5. Produção.
6. Coleta.
7. Embarcado.
8. Chegou ao Brasil.
9. Desembaraço.
10. Transporte nacional.
11. Recebido no estoque.
12. Custo final fechado.

### Indicadores

- Lead time por fornecedor.
- Variação entre custo previsto e real.
- Atrasos.
- Compras abertas.
- Capital parado em importação.

---

## 5.5 Módulo de produtos e seleção de novos SKUs

### Objetivo

Apoiar a escolha de novos produtos com método, reduzindo compra por impulso.

### Funcionalidades

- Cadastro de ideias de produtos.
- Score de oportunidade.
- Simulador de margem.
- Simulador de preço.
- Análise de complexidade operacional.
- Avaliação de risco.
- Status: ideia, pesquisando, cotado, testando, comprado, descartado.

### Critérios de score

- Margem estimada.
- Peso e volume.
- Risco de quebra.
- Potencial de vídeo.
- Concorrência.
- Ticket médio.
- Facilidade de importação.
- Facilidade de armazenamento.
- Possibilidade de kits.
- Risco de devolução.
- Giro esperado.
- Aderência à marca.

---

## 5.6 Módulo de Ads e performance

### Objetivo

Avaliar anúncios com base em lucro, não apenas faturamento ou ROAS.

### Funcionalidades

- Upload manual de relatórios de anúncios da TikTok.
- Futuramente importar anúncios Shopee via API, se disponível no acesso.
- Cadastro de gasto por campanha, produto, canal e período.
- Cálculo de ROAS.
- Cálculo de lucro após Ads.
- Alertas para pausar, manter ou escalar.

### Regras de decisão

- Se ROAS alto, mas lucro baixo: revisar custo/preço.
- Se ROAS baixo e margem negativa: pausar ou reduzir.
- Se ROAS bom e estoque baixo: não escalar até repor.
- Se produto tem boa margem e estoque alto: pode escalar criativos e Ads.

---

## 5.7 Módulo de criativos com IA

### Objetivo

Criar e organizar uma fábrica de criativos para produtos, mantendo histórico e aprendizados.

### Funcionalidades

- Biblioteca de criativos por produto.
- Registro de hooks.
- Registro de roteiros UGC.
- Prompts de vídeo.
- Prompts de imagem.
- Legendas.
- CTAs.
- Status do criativo: ideia, criado, publicado, testado, vencedor, descartado.
- Resultado de performance quando disponível.

### Campos sugeridos

- Produto.
- Dor do cliente.
- Promessa.
- Hook.
- Roteiro.
- Prompt de imagem.
- Prompt de vídeo.
- Canal.
- Data de publicação.
- Métrica de performance.
- Observações.

---

## 5.8 Módulo Analisador de Anúncios

### Objetivo

Verificar a qualidade dos anúncios ativos nos marketplaces para identificar falhas operacionais e oportunidades de otimização que impactam a conversão.

### Funcionalidades

- **Auditoria de Imagens:**
  - Validação das dimensões da foto principal (ex: se atende aos requisitos de 1000x1000px ou se está abaixo).
  - Contagem de fotos no anúncio (identificar se está abaixo do ideal de 5 a 8 imagens).
  - Verificação de presença de vídeo demonstrativo.
- **Auditoria de Textos e Atributos:**
  - Verificação de tamanho e qualidade da descrição (ex: se tem pelo menos 500 caracteres, formatação limpa e uso de palavras-chave).
  - Preenchimento de Ficha Técnica / Características: auditar se campos críticos (ex: marca, modelo, material, dimensões) estão em branco.
- **Auditoria de Reputação e Prova Social:**
  - Monitoramento de nota média das avaliações do anúncio (alertar caso caia abaixo de 4.5).
  - Presença de avaliações com foto/vídeo de compradores (prova social).
- **Indicador de Saúde do Anúncio (Listing Score):**
  - Pontuação de 0 a 100 com base no cumprimento desses critérios para guiar a priorização.

---

## 5.9 Módulo Direcionador de Tarefas (Task Engine)

### Objetivo

Funcionar como a "Central de Comando" ou "Inbox de Prioridades", gerando automaticamente tarefas acionáveis e inteligentes com base nos dados consolidados do sistema, garantindo que o proprietário saiba exatamente o que fazer no tempo livre.

### Funcionalidades e Regras de Geração de Tarefas

- **Tarefas de Estoque e Compras (Geração automática):**
  - *"Repor Estoque:"* Gerado quando a cobertura de estoque de um SKU curva A ou B for menor que o lead time de reposição.
  - *"Liquidar Produto Parado:"* Gerado para produtos sem vendas há mais de 45 dias e com estoque alto.
- **Tarefas de Anúncios e Melhorias (Geração automática):**
  - *"Adicionar Vídeo no Anúncio [Nome/SKU]:"* Gerado quando um anúncio de alto faturamento ou curva A não possui vídeo cadastrado.
  - *"Melhorar Fotos do Anúncio [Nome/SKU]:"* Gerado se o anúncio tiver menos de 4 fotos ou imagens fora do padrão.
  - *"Preencher Características Obrigatórias [Nome/SKU]:"* Gerado quando campos críticos da ficha técnica estiverem vazios.
  - *"Responder Avaliação Negativa:"* Gerado sempre que um anúncio receber uma avaliação abaixo de 3 estrelas.
- **Tarefas de Importação (Geração automática):**
  - *"Cobrar Fornecedor:"* Gerado quando a ETA prevista de produção/envio for ultrapassada sem alteração de status.
- **Interface e Ações:**
  - Painel unificado no topo do Dashboard com as 5 tarefas mais críticas e prioritárias do dia.
  - Possibilidade de "Marcar como Feito" (dismiss) ou adiar.

---

## 6. Arquitetura de dados sugerida

### Tabelas principais

#### users/profile

- id
- email
- nome
- role
- created_at

#### products

- id
- sku
- nome
- canal_principal
- categoria
- tipo: simples, kit, variação
- status
- custo_unitario_atual
- preco_venda_atual
- peso
- volume
- fornecedor_principal_id
- created_at
- updated_at

#### product_components

Usada para kits.

- id
- kit_product_id
- component_product_id
- quantidade_componente

#### inventory_snapshots

- id
- product_id
- data_snapshot
- estoque_disponivel
- estoque_reservado
- estoque_em_transito
- fonte
- import_batch_id

#### orders

- id
- marketplace
- external_order_id
- data_pedido
- status
- receita_bruta
- descontos
- frete_cliente
- taxas_marketplace
- impostos_estimados
- valor_liquido_estimado
- import_batch_id

#### order_items

- id
- order_id
- product_id
- sku
- quantidade
- preco_unitario
- receita_item
- custo_unitario_estimado
- lucro_estimado

#### ads_spend

- id
- canal
- campanha
- product_id
- data_inicio
- data_fim
- gasto
- receita_atribuida
- pedidos_atribuidos
- roas
- fonte
- import_batch_id

#### import_batches

Controla uploads e integrações.

- id
- fonte
- tipo_arquivo
- nome_arquivo
- status
- linhas_lidas
- linhas_processadas
- erros
- uploaded_by
- created_at

#### suppliers

- id
- nome
- pais
- contato
- tempo_resposta_medio
- observacoes

#### purchase_imports

Pedidos de importação.

- id
- supplier_id
- codigo_pedido
- status
- etapa_atual
- data_pedido
- data_pagamento
- eta_prevista
- data_recebimento
- moeda
- cambio
- valor_produtos
- frete_internacional
- impostos
- taxas
- custo_total_previsto
- custo_total_real
- observacoes

#### purchase_import_items

- id
- purchase_import_id
- product_id
- quantidade_comprada
- quantidade_recebida
- custo_unitario_previsto
- custo_unitario_real

#### product_ideas

- id
- nome_ideia
- categoria
- fornecedor_sugerido
- custo_estimado
- preco_estimado
- margem_estimada
- score_oportunidade
- status
- observacoes

#### creatives

- id
- product_id
- tipo
- hook
- roteiro
- prompt_imagem
- prompt_video
- legenda
- cta
- status
- canal
- data_publicacao
- metricas

#### business_rules

- id
- nome_regra
- tipo
- valor
- data_inicio
- data_fim
- ativo

#### listings

- id
- product_id
- marketplace
- external_item_id
- url
- titulo
- status
- sku_mapeado
- created_at
- updated_at

#### listing_analyses

- id
- listing_id
- listing_score
- num_fotos
- possui_video
- dimensao_foto_principal_ok
- tamanho_descricao
- campos_ficha_tecnica_vazios (json ou string[])
- media_avaliacoes
- data_analise
- observacoes
- created_at

#### actionable_tasks

- id
- tipo_tarefa: estoque, anuncio, importacao, financeiro
- titulo
- descricao
- prioridade: alta, media, baixa
- status: pendente, concluido, adiado
- metadata (json para relacionar a orders, products, listings, etc)
- data_conclusao
- created_at
- updated_at

#### payout_reconciliations

- id
- order_id
- external_order_id
- valor_recebido_real
- taxa_cobrada_real
- frete_cobrado_real
- status_reconciliacao: conciliado, divergente
- divergente_valor
- data_conciliacao
- created_at

---

## 7. Fluxo de dados

## 7.1 Shopee via API

Fluxo desejado:

1. Autenticar com API Shopee.
2. Buscar pedidos novos.
3. Buscar itens dos pedidos.
4. Mapear SKUs da Shopee com `products.sku`.
5. Gravar em `orders` e `order_items`.
6. Evitar duplicidade usando `marketplace + external_order_id`.
7. Atualizar indicadores financeiros.

## 7.2 TikTok via upload

Fluxo inicial:

1. Usuário exporta relatório da TikTok.
2. Usuário faz upload no painel.
3. Sistema identifica colunas.
4. Sistema mostra prévia antes de importar.
5. Usuário confirma.
6. Sistema grava em tabelas de pedidos, anúncios ou performance, conforme arquivo.

## 7.3 UPSeller via Excel

Fluxo inicial:

1. Usuário exporta planilha da UPSeller.
2. Upload no sistema.
3. Sistema identifica se é arquivo de estoque, produtos, kits ou custos.
4. Sistema mapeia colunas.
5. Sistema valida SKUs.
6. Sistema grava em `products`, `inventory_snapshots` e `product_components`.
7. Sistema cria log da importação.

---

## 8. Telas do MVP

## 8.1 Login

- Login com e-mail e senha.
- Acesso privado.
- Apenas usuários autorizados.

## 8.2 Dashboard

Cards:

- Faturamento do mês.
- Lucro estimado.
- Margem líquida.
- Pedidos.
- Ads.
- ROAS.
- Produtos em risco.
- Produtos parados.

Blocos:

- Alertas do dia.
- Top produtos por lucro.
- Top produtos por faturamento.
- Produtos com margem negativa.
- Ruptura prevista.

## 8.3 Produtos

- Lista de produtos.
- Cadastro/edição.
- SKU.
- Custo.
- Preço.
- Tipo: simples ou kit.
- Estoque atual.
- Margem estimada.

## 8.4 Uploads

- Upload de planilhas.
- Tipo do arquivo: UPSeller estoque, UPSeller produtos, UPSeller kits, TikTok pedidos, TikTok Ads, outros.
- Prévia dos dados.
- Validação.
- Importar.
- Histórico de importações.

## 8.5 Financeiro

- DRE mensal.
- Lucro por produto.
- Margem por SKU.
- Taxas e custos.
- Produtos com prejuízo.

## 8.6 Estoque

- Estoque atual.
- Venda média diária.
- Dias de cobertura.
- Ponto de reposição.
- Sugestão de compra.
- Alerta de ruptura.

## 8.7 Importações

- Kanban por etapa.
- Cadastro de pedido internacional.
- Custos previstos e reais.
- Fornecedor.
- ETA.
- Status.

## 8.8 Criativos

- Biblioteca de hooks.
- Prompts de vídeo.
- Prompts de imagem.
- Status de criação/teste.

## 8.9 Analisador de Anúncios

- Tabela de anúncios com o "Listing Score" (0 a 100).
- Filtros por canal (Shopee, TikTok).
- Indicadores visuais de falhas (ex: ícone vermelho se faltar vídeo, contagem de fotos, aviso de descrição curta).
- Painel de detalhe do anúncio com sugestões automáticas de melhorias (ex: "Sua imagem de capa tem apenas 600x600px. Recomendamos subir uma imagem com pelo menos 1000x1000px").
- Nota média das avaliações do anúncio.

## 8.10 Direcionador de Tarefas (Inbox de Prioridades)

- Widget central no topo do Dashboard ("O que você precisa fazer hoje").
- Painel dedicado com a lista completa de tarefas pendentes, ordenadas por prioridade.
- Categorização (Falta de Estoque, Melhorias de Anúncio, Importação Atrasada).
- Botão rápido para marcar tarefa como concluída ou ocultar.

---

## 9. MVP recomendado

O primeiro MVP não deve tentar resolver tudo.

### MVP 1 — Controle financeiro e estoque

Entregáveis:

1. Projeto React/Next.js.
2. Supabase configurado.
3. Autenticação.
4. Banco com tabelas principais (incluindo `actionable_tasks`).
5. Cadastro de produtos.
6. Upload de estoque UPSeller.
7. Upload de pedidos manual.
8. DRE simplificada.
9. Cálculo de lucro por SKU.
10. Cálculo de cobertura de estoque.
11. Alertas de ruptura.
12. **Direcionador de Tarefas (Inbox de Prioridades):** Geração e exibição no Dashboard das 5 tarefas mais críticas (ex: estoque acabando, produto sem girar).

### Fora do MVP 1

- Integração completa Shopee API (mas pode-se usar partes já desenvolvidas de integrações anteriores).
- Integração TikTok API.
- Analisador completo de anúncios (fotos, descrições, ficha técnica) - *Fase Posterior*.
- Automação avançada de Ads.
- IA geradora de criativos dentro do app.
- Previsão estatística avançada.

Esse itens ficam para fases posteriores.

---

## 10. Fases de desenvolvimento

## Fase 0 — Fundação

- Criar repositório GitHub.
- Criar projeto frontend.
- Configurar Supabase.
- Configurar Netlify.
- Criar `.env.example`.
- Criar README.
- Criar estrutura de pastas.

## Fase 1 — Banco e autenticação

- Criar schema inicial.
- Criar tabelas principais.
- Criar políticas RLS.
- Criar login.
- Criar layout principal.

## Fase 2 — Produtos e UPSeller

- Tela de produtos.
- Importador de produtos.
- Importador de estoque.
- Importador de kits.
- Mapeamento de colunas.
- Histórico de uploads.

## Fase 3 — Pedidos e financeiro

- Importador de pedidos.
- Cálculo de receita.
- Cálculo de custos.
- Cálculo de margem.
- DRE mensal.
- Lucro por SKU.

## Fase 4 — Estoque e S&OP

- Venda média diária.
- Dias de cobertura.
- Ponto de reposição.
- Alertas.
- Curva ABC.
- **Implementar motor de geração de tarefas do Direcionador de Tarefas** (Ruptura e estoque crítico, produto parado).

## Fase 5 — Importação

- Cadastro de fornecedores.
- Cadastro de importações.
- Kanban de etapas.
- Custo previsto versus real.
- Cálculo de custo final importado (rateio de frete/taxas).
- Geração de tarefas de importação (cobrança de fornecedores com atraso na ETA).

## Fase 6 — Shopee API

- Implementar autenticação Shopee (aproveitando códigos de sincronização existentes).
- Buscar pedidos.
- Buscar itens.
- Sincronização incremental.
- Logs.
- Tratamento de erros.

## Fase 7 — Ads, criativos e Análise de Anúncios

- Upload de relatórios de Ads.
- ROAS.
- Lucro pós-Ads.
- Biblioteca de criativos.
- Gerador de prompts interno.
- **Analisador de Anúncios:** Implementar regras de pontuação (Listing Score) de qualidade (fotos, dimensões, descrição, ficha técnica, avaliações).
- **Geração de tarefas de melhoria de anúncio:** Criar tarefas automáticas baseadas em falhas nos anúncios (ex: adicionar vídeo, melhorar fotos).

---

## 11. Regras de qualidade

1. Não criar telas sem regra de negócio clara.
2. Não criar gráfico sem decisão associada.
3. Todo upload deve ter log.
4. Toda importação deve ter validação.
5. Toda tabela crítica deve ter `created_at` e `updated_at`.
6. Toda integração deve evitar duplicidade.
7. Cálculos financeiros devem ser rastreáveis.
8. O sistema deve mostrar quando um dado é estimado.
9. Deve haver fallback manual quando a integração falhar.
10. O projeto deve ser documentado para evolução com Codex.

---

## 12. Subagentes lógicos para execução com IA

Os subagentes abaixo são papéis lógicos. Eles podem ser simulados dentro do próprio Codex/IA para aumentar a qualidade da execução.

### 12.1 Agente Product Owner

Responsável por:

- Entender o negócio.
- Quebrar o projeto em fases.
- Definir prioridade.
- Transformar necessidades em user stories.
- Proteger o MVP contra excesso de escopo.

### 12.2 Agente Arquiteto de Solução

Responsável por:

- Definir arquitetura.
- Escolher estrutura de pastas.
- Definir padrões técnicos.
- Garantir escalabilidade.
- Revisar decisões de stack.

### 12.3 Agente Data Engineer / Supabase

Responsável por:

- Modelar banco de dados.
- Criar migrations SQL.
- Criar relacionamentos.
- Criar índices.
- Criar RLS.
- Validar integridade dos dados.

### 12.4 Agente Integrações e ETL

Responsável por:

- Upload de Excel/CSV.
- Mapeamento de colunas.
- Limpeza de dados.
- Logs de importação.
- Integração Shopee API.
- Preparação para futura TikTok API.

### 12.5 Agente Financeiro

Responsável por:

- Regras de DRE.
- Margem por SKU.
- Lucro por pedido.
- Rateio de Ads.
- Custo importado.
- Validação dos cálculos.

### 12.6 Agente S&OP / Estoque

Responsável por:

- Cobertura de estoque.
- Ponto de reposição.
- Curva ABC.
- Produtos parados.
- Sugestão de compra.
- Tratamento de kits.

### 12.7 Agente Importação

Responsável por:

- Fluxo de compras internacionais.
- Kanban de importação.
- Lead time.
- Custo previsto e real.
- Status e alertas.

### 12.8 Agente UI/UX

Responsável por:

- Layout limpo e responsivo.
- Navegação simples.
- Cards claros.
- Alertas acionáveis.
- Redução de poluição visual.

### 12.9 Agente QA e Segurança

Responsável por:

- Testes.
- Validação dos cálculos.
- Teste de upload.
- Verificar RLS.
- Verificar variáveis sensíveis.
- Evitar exposição de chaves.

### 12.10 Agente DevOps / Deploy

Responsável por:

- Configurar Netlify.
- Configurar variáveis de ambiente.
- Criar scripts de build.
- Documentar deploy.
- Garantir que o projeto rode localmente.

---

# Prompt Mestre para Codex/IA

Use o prompt abaixo para iniciar a criação do sistema.

```text
Você é um time de desenvolvimento sênior atuando com subagentes especializados para criar um sistema web privado chamado JV Imports Control Tower.

CONTEXTO DO NEGÓCIO
A JV Imports é uma empresa de e-commerce de produtos importados. O proprietário também trabalha como CLT, então o sistema precisa reduzir trabalho manual, centralizar dados e gerar alertas acionáveis. A empresa vende em marketplaces, importa produtos diretamente e hoje possui informações espalhadas entre Shopee, TikTok, UPSeller, planilhas e controles manuais.

OBJETIVO DO SISTEMA
Criar um painel web privado que responda diariamente:
1. Onde estou ganhando dinheiro?
2. Onde estou perdendo dinheiro?
3. Quais produtos podem acabar?
4. Quais produtos estão parados?
5. Quais anúncios estão consumindo margem?
6. Quais importações precisam de atenção?
7. O que preciso fazer hoje?

STACK DEFINIDA
- Frontend: React ou Next.js.
- Banco/backend: Supabase/PostgreSQL.
- Autenticação: Supabase Auth.
- Storage: Supabase Storage para arquivos importados.
- Hospedagem: Netlify Free inicialmente.
- Código: GitHub.
- Domínio: não usar domínio próprio no início.

FONTES DE DADOS
1. Shopee: pode ser integrada via API. Preparar arquitetura para API, mas não depender disso no MVP inicial.
2. TikTok: ainda sem API. Dados devem entrar via upload manual de CSV/XLSX.
3. UPSeller: fonte de estoque, custo de compra, composição de kits, produtos e variações. Dados entram via exportação Excel.
4. Dados manuais: custos, impostos, taxas, embalagem, câmbio e ajustes.

MVP PRIORITÁRIO
Construir primeiro um MVP com:
1. Login privado.
2. Layout principal com menu lateral.
3. Dashboard inicial.
4. Cadastro/listagem de produtos/SKUs.
5. Upload de arquivos UPSeller para produtos, estoque e kits.
6. Upload manual de pedidos/relatórios.
7. Tabelas no Supabase.
8. Cálculo de lucro estimado por pedido e SKU.
9. DRE mensal simplificada.
10. Cálculo de estoque, venda média diária, dias de cobertura e alerta de ruptura.
11. Histórico de importações.
12. Logs de erro por arquivo.

SUBAGENTES OBRIGATÓRIOS
Antes de desenvolver, simule estes subagentes e faça cada um entregar sua análise:

1. Product Owner:
- Refinar o escopo.
- Quebrar em fases.
- Definir user stories.
- Proteger o MVP contra excesso de funcionalidades.

2. Arquiteto de Solução:
- Definir arquitetura.
- Definir estrutura de pastas.
- Definir padrões de frontend/backend.
- Definir estratégia de deploy Netlify + Supabase.

3. Data Engineer/Supabase:
- Criar schema PostgreSQL.
- Criar migrations SQL.
- Criar tabelas, chaves, índices e relacionamentos.
- Criar políticas RLS.
- Garantir integridade dos dados.

4. Integrações/ETL:
- Criar estratégia de upload CSV/XLSX.
- Criar mapeamento de colunas.
- Criar validação antes de importar.
- Criar logs de importação.
- Preparar arquitetura para Shopee API futura.
- Preparar TikTok apenas como upload manual no MVP.

5. Especialista Financeiro:
- Definir fórmulas de receita, custos, margem e lucro.
- Criar DRE simplificada.
- Criar cálculo por SKU e pedido.
- Separar valores reais de valores estimados.

6. Especialista S&OP/Estoque:
- Criar cálculo de venda média diária.
- Criar cálculo de dias de cobertura.
- Criar ponto de reposição.
- Criar alertas de ruptura.
- Tratar kits com base nos componentes.

7. Especialista de Importação:
- Planejar módulo futuro de compras internacionais.
- Definir estrutura de dados para fornecedores, pedidos de importação, etapas e custos.
- Não desenvolver tudo no MVP se isso atrasar financeiro e estoque.

8. UI/UX Designer:
- Criar interface limpa, responsiva e objetiva.
- Priorizar cards, alertas e tabelas simples.
- Evitar poluição visual.
- Criar experiência boa para desktop e celular.

9. QA/Security:
- Verificar cálculos.
- Testar upload.
- Testar login.
- Validar RLS.
- Garantir que nenhuma chave secreta fique no frontend.

10. DevOps/Deploy:
- Preparar projeto para GitHub.
- Criar `.env.example`.
- Criar README.
- Configurar build para Netlify.
- Documentar deploy.

ORDEM DE EXECUÇÃO
Não programe tudo de uma vez. Execute nesta ordem:

FASE 0 — Planejamento técnico
- Apresente a arquitetura proposta.
- Apresente a estrutura de pastas.
- Apresente o modelo de dados inicial.
- Apresente as decisões assumidas.

FASE 1 — Setup
- Criar projeto React/Next.js.
- Configurar Supabase client.
- Criar layout base.
- Criar rotas principais.
- Criar `.env.example`.

FASE 2 — Banco
- Criar migrations SQL.
- Criar tabelas principais:
  - profiles/users
  - products
  - product_components
  - inventory_snapshots
  - orders
  - order_items
  - ads_spend
  - import_batches
  - suppliers
  - purchase_imports
  - purchase_import_items
  - product_ideas
  - creatives
  - business_rules
- Criar índices.
- Criar RLS.

FASE 3 — Produtos e UPSeller
- Criar tela de produtos.
- Criar upload de produtos/estoque/kits.
- Criar prévia antes de importar.
- Criar validação.
- Criar gravação no Supabase.
- Criar histórico de importações.

FASE 4 — Pedidos e financeiro
- Criar upload de pedidos.
- Criar cálculo de receita, custo, margem e lucro.
- Criar tela financeira.
- Criar DRE mensal simplificada.
- Criar ranking de lucro por SKU.

FASE 5 — Estoque e alertas
- Criar venda média diária.
- Criar dias de cobertura.
- Criar ponto de reposição.
- Criar alerta de ruptura.
- Criar alerta de produto parado.
- Criar tratamento de kits.

FASE 6 — Dashboard
- Criar dashboard principal com cards e alertas.
- Mostrar faturamento, lucro, margem, pedidos, estoque em risco e produtos parados.
- Criar visual simples e responsivo.

FASE 7 — Deploy
- Preparar Netlify.
- Documentar variáveis de ambiente.
- Documentar comandos.
- Garantir build sem erro.

REGRAS DE IMPLEMENTAÇÃO
1. Priorize MVP funcional em vez de sistema perfeito.
2. Nunca misture chave secreta no frontend.
3. Todo upload precisa ter log.
4. Toda importação precisa evitar duplicidade.
5. Toda tela precisa ter objetivo claro.
6. Todo cálculo financeiro precisa ser rastreável.
7. Se um dado for estimado, exibir como estimado.
8. Se houver dúvida, tomar uma decisão razoável, documentar em `ASSUMPTIONS.md` e seguir.
9. Criar código limpo e organizado.
10. Criar README com instruções para rodar localmente e publicar no Netlify.

ENTREGÁVEIS ESPERADOS
1. Estrutura do projeto.
2. Schema SQL do Supabase.
3. Componentes principais.
4. Telas do MVP.
5. Funções de upload.
6. Funções de cálculo.
7. Dashboard.
8. README.
9. `.env.example`.
10. `ASSUMPTIONS.md`.
11. `ROADMAP.md`.

COMECE AGORA PELA FASE 0.
Antes de escrever código, entregue:
1. Arquitetura proposta.
2. Estrutura de pastas.
3. Modelo de dados inicial.
4. User stories do MVP.
5. Plano de implementação em tarefas pequenas.
Depois disso, inicie a criação dos arquivos do projeto.
```

---

## 12. Prompt curto para continuar tarefas específicas no Codex

Use este prompt quando quiser mandar o Codex trabalhar em uma tarefa menor:

```text
Você está trabalhando no projeto JV Imports Control Tower.
Siga o playbook do projeto e mantenha o escopo do MVP.

Tarefa atual:
[DESCREVER A TAREFA AQUI]

Antes de alterar arquivos:
1. Identifique quais arquivos serão impactados.
2. Explique rapidamente a abordagem.
3. Faça a alteração.
4. Rode ou indique os testes/verificações necessários.
5. Atualize documentação se necessário.

Regras:
- Não quebrar funcionalidades existentes.
- Não expor secrets no frontend.
- Manter compatibilidade com Supabase e Netlify.
- Registrar premissas em ASSUMPTIONS.md quando necessário.
```

---

## 13. Critério de sucesso do MVP

O MVP será considerado bem-sucedido quando o usuário conseguir:

1. Fazer login.
2. Cadastrar ou importar produtos.
3. Importar estoque da UPSeller.
4. Importar pedidos manualmente.
5. Ver faturamento e lucro estimado.
6. Ver margem por produto.
7. Ver produtos em risco de ruptura.
8. Ver produtos parados.
9. Ver um dashboard claro com alertas.
10. Hospedar o projeto na Netlify.

---

## 14. Próxima evolução depois do MVP

Após validar o MVP, evoluir para:

1. Integração Shopee API.
2. Módulo completo de importação.
3. Módulo de Ads.
4. Biblioteca de criativos com IA.
5. Score de novos produtos.
6. Simulador de precificação.
7. Previsão de demanda mais avançada.
8. Relatórios automáticos semanais.
9. Alertas via WhatsApp, e-mail ou Telegram.

---

## 15. Filosofia do sistema

Este sistema não deve ser apenas um dashboard bonito.

Ele deve funcionar como uma torre de controle operacional da empresa.

A prioridade é transformar dados em ações:

- Comprar.
- Pausar anúncio.
- Repor estoque.
- Reprecificar.
- Liquidar produto parado.
- Criar criativo novo.
- Cobrar fornecedor.
- Revisar margem.

Se uma tela não ajuda a tomar decisão, ela não deve entrar no MVP.
