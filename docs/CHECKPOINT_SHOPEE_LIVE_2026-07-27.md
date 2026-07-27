# Checkpoint — Shopee Live e gestão de marketplaces

Data: 2026-07-27 (America/Sao_Paulo)

## Go-Live confirmado

- O app `Mavix Hub` foi aprovado pela Shopee para Go-Live.
- As credenciais Live foram cadastradas diretamente nos Edge Function Secrets do projeto de produção `Central de Bases Shopee`.
- `SHOPEE_THIRD_PARTY_ENVIRONMENT=live`.
- `MAVIS_SHOPEE_V3_ENABLED=true`.
- Partner ID, Partner Key e tokens não foram registrados em chat, Git, documentação ou logs.
- Uma chamada assinada de pré-validação foi aceita pelo endpoint Live e redirecionou para o login oficial `open.shopee.com`.
- O callback público permanece protegido por state de uso único; uma chamada sem parâmetros retorna `callback_invalid`.
- `shopee-oauth-v3` e `shopee-sync-v3` continuam exigindo autenticação.

## Estado das conexões

- Duas conexões Live legadas pertencem à conta `JV Imports` e aguardam reautorização OAuth v3.
- Uma conexão Sandbox continua ativa e segregada por `environment='sandbox'`.
- Nenhuma conexão Sandbox foi convertida, substituída ou misturada com Live.
- Os dados históricos foram preservados:
  - uma das lojas Live possui 7.299 pedidos, 76 produtos e 5.764 registros de escrow;
  - a outra conexão Live não possui registros nesses três módulos.

## Problema de experiência identificado

O Dashboard exibia o histórico consolidado enquanto a tela de Integrações indicava Shopee inativa. As duas conexões legadas também apareciam com o mesmo nome genérico `Loja Principal`, e o seletor global ainda dependia do fluxo antigo.

Isso não era vazamento nem conexão fantasma: eram dados históricos corretamente vinculados à conta, mas sem explicação visual suficiente.

## Melhoria implementada localmente

- Tela renomeada para `Marketplaces e lojas`.
- Botão `Adicionar canal` com escolha explícita entre Shopee e UPSeller; Mercado Livre e Amazon aparecem somente como `Em preparação`.
- Cada conexão Shopee aparece em uma linha própria, identificada pelo ID externo quando o nome é genérico ou duplicado.
- Estados `Ativa`, `Reautorização necessária` e `Desconectada` ficam visíveis por loja.
- Lojas ativas mantêm ações individuais de catálogo, pedidos, financeiro, Ads e desconexão.
- Lojas legadas recebem ação individual de reautorização e aviso de que o histórico está preservado.
- O seletor global de lojas passa a receber as conexões OAuth v3, incluindo lojas históricas pendentes.
- O Dashboard informa quando o consolidado ou a loja selecionada contém dados históricos sem atualização automática.
- A seleção volta para `Todas as Lojas` se a conexão selecionada for desconectada.

## Validação local

- Sintaxe aprovada para `app.js`, `shopee-third-party-app.js` e `theme-toggle.js`.
- Contrato estático do frontend aprovado.
- Novos asserts adicionados para gestão de canais, histórico preservado e propagação das conexões v3.
- A inspeção visual automatizada local ficou bloqueada pela integração de navegador desta máquina; revisar no deploy preview antes de promover.

## Próximos passos

1. Gerar o build e executar a suíte completa no CI.
2. Publicar em deploy preview.
3. Validar em desktop e mobile:
   - lista das duas lojas Live com IDs distintos;
   - aviso de dados históricos;
   - seletor global por loja;
   - painel `Adicionar canal`;
   - reautorização de uma loja real;
   - sincronização e desconexão individual.
4. Após o preview verde, promover o frontend.
5. Reautorizar primeiro uma loja interna, validar sync e somente então reautorizar a segunda.
