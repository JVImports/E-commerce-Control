# Sincronização econômica e nomes de lojas

Atualizado em 01/10/2026. Projeto de produção: Central de Bases Shopee (`qzcxukcwvjnhbnwpjceg`). Este documento substitui as frequências e a carga inicial do runbook multiloja anterior.

## Uso no site

Em Integrações, proprietários e administradores podem escolher **Renomear loja**, informar até 80 caracteres e **Salvar nome**. O nome fica em `shopee_connections.metadata.display_name`, aparece no seletor e nos pedidos, e é preservado na reautorização. O nome e o identificador na Shopee permanecem vinculados à mesma conexão.

Cada loja mostra a última verificação de pedidos, a próxima tentativa e o motivo de eventual pausa. **Reautorizar pela Shopee** renova uma conexão expirada. Um callback OAuth bem-sucedido ativa novamente as três rotinas. **Retomar sincronização** permite tentar novamente uma rotina pausada de uma conexão ainda ativa, depois de corrigida a causa.

## Frequências e limites

| Processo | Frequência configurada por loja |
| --- | --- |
| Pedidos | 30 minutos |
| Financeiro (escrow e resumo de renda) | 2 horas |
| Catálogo | 12 horas |
| Agendador | A cada 5 minutos, uma rotina por execução |

Os horários efetivos dependem da fila e da duração das consultas. Janelas de pedidos pendentes voltam à fila após 5 minutos. O processo financeiro deixou de reimportar meses de pedidos. Ads continua por importação de relatório; as rotinas legadas de pedidos, catálogo, wallet, returns e escrow foram desativadas, preservando as definições dos jobs e os dados históricos.

Pedidos usam `update_time`, janelas de até 14 dias, sobreposição de 5 minutos e até 3 páginas de 100 pedidos por execução. A primeira janela parte da última importação disponível, ou dos últimos 14 dias quando não há dados. O processo busca detalhes em lotes de 50. Só grava pedidos alterados, com cabeçalho e itens em uma transação. O cursor avança apenas após gravação bem-sucedida; não avança quando os detalhes estão incompletos ou a paginação não progride.

O agendador limita a 160 execuções de sincronização por conta/dia UTC (incluindo falhas), adia ao próximo dia quando esse teto é atingido e pausa a conta a partir de 450.000.000 bytes de banco. A medição é feita antes de cada execução e não impede crescimento causado por outras operações. Erros transitórios recebem espera crescente e pausam após 5 tentativas consecutivas. Chave de aplicativo expirada pausa a conta; autorização expirada marca a loja como `reauthorization_required` e pausa suas rotinas. Os tokens permanecem no Vault e as funções mantêm a validação JWT e a autorização de conta no servidor.

Para duas lojas sem fila acumulada, são até 124 sincronizações/dia e 288 chamadas/dia do agendador: aproximadamente 12.360 invocações em 30 dias, sem acessos manuais, OAuth, tentativas extras ou outros recursos do projeto. O limite diário não é um limite de todas as Edge Functions. O plano Free também limita banco e tráfego, e tem CPU compartilhada; esta política reduz consumo, mas não garante que o projeto inteiro permaneça dentro de todas as cotas. Referência: https://supabase.com/pricing.

## Publicação

1. Aplicar `20261001144933_economical_incremental_shopee_sync.sql`; ela pausa as rotinas durante a transição.
2. Publicar `shopee-sync-v3`, `shopee-sync-scheduler-v1` e `shopee-oauth-v3`, incluindo os arquivos `_shared` necessários e `verify_jwt=true`. O callback `shopee-oauth-callback-v3` permanece sem validação JWT, autenticado pelo state temporário de uso único.
3. Aplicar `20261001154233_qualify_shopee_oauth_reauthorization_cleanup.sql` e validar a qualificação das duas referências à coluna de tokens nos dois overloads de `finalize_shopee_oauth_v3`. Validar atomicidade da RPC `upsert_shopee_order_page`, seus privilégios exclusivos para `service_role` e a preservação do nome no OAuth.
4. Aplicar `20261001151953_activate_economical_shopee_scheduler.sql`. Conexões que precisam de reautorização continuam pausadas. A migração altera o job existente; não criar um segundo agendador.
5. Publicar o frontend pelo GitHub/Netlify. Validar Integrações e Pedidos com usuário autenticado.

O GitHub/Netlify publica o frontend; o deploy das funções e das migrações do Supabase é separado.

## Diagnóstico

Consultar `sync_runs` (resultado por execução), `shopee_sync_schedules` (fila/pausas), `sync_cursors` (progresso por loja) e os campos públicos de `shopee_connections`. Não consultar nem copiar tokens, chaves de serviço, segredos do cron ou conteúdo do Vault em diagnósticos.

Em 01/10/2026, testes reais das duas lojas Live retornaram autorização expirada. Os dados históricos foram preservados e a atualização depende de reautorizar cada loja na Shopee. A liberação JWT permanece ativa nas três funções. Testes locais: `node --test --test-isolation=none tests/*.test.mjs`. Tipos: `deno check` nos três entrypoints. O teste SQL de atomicidade usa transação com rollback e não deixa pedidos fictícios no banco.

As primeiras tentativas de reautorização posteriores falharam com SQLSTATE `42702`: o parâmetro de saída `authorization_id` conflitava com duas colunas não qualificadas na limpeza da autorização substituída. A migração de correção qualifica essas colunas, preservando assinaturas e privilégios. O callback passa a registrar apenas códigos seguros de falha; erros estruturados de RPC retornam `authorization_save_failed`. O frontend mantém esse aviso durante o carregamento das integrações. Testes de callback e persistência do aviso elevaram a suíte a 35 testes. Após corrigir essa falha, iniciar uma nova autorização; os estados anteriores estão concluídos com erro e não devem ser reutilizados.
