# Scheduler multiloja Shopee

## Objetivo

Sincronizar cada conexão Shopee Live ativa sem fixar `shop_id` nos jobs. A fila é criada quando uma loja é autorizada ou reautorizada e também recebe as conexões já ativas na primeira aplicação da migration.

## Componentes

- `public.shopee_sync_schedules`: uma agenda por `connection_id` e módulo.
- `public.sync_runs`: histórico de cada execução do scheduler.
- `shopee-sync-scheduler-v1`: seleciona uma tarefa vencida, cria um lease de 15 minutos e chama o worker.
- `shopee-sync-v3`: aceita chamadas internas somente com `x-mavis-scheduler-secret` e limita o scheduler a Catálogo, Pedidos, Financeiro e Ads.

## Cadência inicial

| Módulo | Carga inicial | Recorrência |
| --- | --- | --- |
| Catálogo | Catálogo completo | 6 horas |
| Pedidos | Até 3 meses | passo incremental a cada 10 minutos |
| Financeiro | Pedidos do mês, escrow e resumo | 30 minutos |
| Ads | Últimos 30 dias | 6 horas |

O scheduler executa uma tarefa por invocação. Isso preserva o limite da Shopee e impede que a inclusão de uma loja bloqueie as demais.

## Publicação futura — somente após revisão

1. Definir `MAVIS_SHOPEE_SCHEDULER_SECRET` com um valor aleatório forte nas Edge Functions `shopee-sync-v3` e `shopee-sync-scheduler-v1`.
2. Armazenar o mesmo segredo no Supabase Vault, sem colocá-lo em migration, Git ou frontend.
3. Aplicar a migration e publicar as duas funções.
4. Invocar o scheduler manualmente com o segredo e confirmar uma execução em `sync_runs`.
5. Criar um único job `pg_cron` que chama `shopee-sync-scheduler-v1` a cada minuto usando `pg_net`, a chave do Vault e o header interno.
6. Só depois de confirmar pelo menos uma execução de cada módulo nas duas lojas, desativar os jobs legados fixos em `1382486082`.

## Operação

- Uma falha mantém a tarefa na fila com backoff exponencial de 5 a 120 minutos.
- O lease expira em 15 minutos; uma execução interrompida pode ser retomada sem intervenção manual.
- `last_error` é limitado a 500 caracteres e não deve conter tokens ou payloads da Shopee.
- Não ativar o job novo antes de migrar as rotinas legadas de carteira, devoluções e Ads diário, caso esses dados também precisem ser multiloja.
