# Checkpoint — Go-Live Shopee enviado para revisão

Data do checkpoint: 18/07/2026 (BRT).

## Resultado alcançado

- O app **Mavix Hub** foi enviado pelo Shopee Open Platform para análise de Go-Live.
- A Shopee confirmou na tela que a solicitação está em revisão e informou retorno esperado em aproximadamente 24 horas.
- O botão `Submit` concluiu o envio; não há nova ação técnica enquanto a revisão estiver pendente.
- O app Sandbox continua separado do futuro ambiente Live.

## Estado técnico confirmado antes do envio

- OAuth Sandbox concluído com uma loja de teste Shopee.
- Conexão Sandbox BR ativa e sincronização executada sem erro.
- Tokens permanecem armazenados no Supabase Vault; valores de tokens e chaves não são registrados neste documento.
- Gateway Sandbox corrigido para `https://openplatform.sandbox.test-stable.shopee.sg`.
- Correção incorporada à `origin/main` no commit squash `e616150` (PR #6).
- Edge Functions implantadas e verificadas antes da submissão:
  - `mavis-integrations-v1` v13;
  - `shopee-oauth-v3` v11;
  - `shopee-oauth-callback-v3` v12;
  - `shopee-sync-v3` v10.

## Informações declaradas no Go-Live

- `APP IP Address Management`: um endereço-modelo aceito pelo formulário.
- `Enable IP Address Whitelist`: desativado, pois Supabase Edge Functions não oferecem IP de saída estático.
- `Database Servers`: `IP address unavailable`; banco hospedado em infraestrutura PostgreSQL gerenciada pelo Supabase, sem IP estático dedicado ao app.
- `Other Servers`: `IP address unavailable`; infraestrutura serverless gerenciada, sem servidores adicionais dedicados.
- O texto de introdução informa que o app usa infraestrutura serverless sem IP de saída estático, mantém a whitelist desativada e não solicita dados pessoais não mascarados.
- URL pública de revisão: `https://ecommerce-control-jv.netlify.app/?review=shopee`.

## Evidências locais a preservar até a decisão

- `evidence-private/shopee/go-live-2026-07-18/reviewer-login.png`: login do revisor.
- `evidence-private/shopee/go-live-2026-07-18/sandbox-integration.png`: integração Shopee Sandbox ativa.
- `evidence-private/shopee/go-live-2026-07-18/dashboard.png`: dashboard.
- `evidence-private/shopee/go-live-2026-07-18/inventory.png`: estoque e planejamento.
- `evidence-private/shopee/go-live-2026-07-18/app-config-2026-07-17.png`: configuração do app com chave mascarada.
- `evidence-private/shopee/go-live-2026-07-18/app-creation-form.png`: referência histórica do formulário.

Essas imagens não devem ser publicadas em repositório aberto. A captura de login contém o e-mail de teste, embora a senha esteja mascarada.

## Próxima ação quando a Shopee responder

1. Registrar o status e a mensagem exata da Shopee.
2. Se aprovado, obter o `Live Partner ID` e configurar o `Live Partner Key` diretamente como segredo seguro; nunca colar a chave em chat, documento ou commit.
3. Configurar o ambiente Live sem substituir nem misturar as credenciais Sandbox.
4. Executar um OAuth Live controlado, validar callback, Vault, sincronização e logs sem tokens.
5. Somente depois da validação Live, arquivar ou remover as evidências temporárias da submissão.

## Regra de segurança durante a revisão

- Não alterar URL de revisão, conta do revisor, callback, descrição do app ou configuração de IP enquanto a Shopee estiver analisando.
- Não ativar a whitelist com o endereço-modelo; isso bloquearia chamadas originadas pelas Edge Functions dinâmicas.
- Não remover ainda os documentos e screenshots usados na submissão.
