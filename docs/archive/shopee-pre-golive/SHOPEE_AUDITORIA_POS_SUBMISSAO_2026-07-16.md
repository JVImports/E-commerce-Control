# Auditoria pós-submissão Shopee Third-party - 16/07/2026

## Escopo e ressalva de conta

Esta auditoria compara o formulário documentado, a aplicação Mavis, o deploy Netlify e o Supabase de produção com os critérios públicos da Shopee Open Platform.

A conta Shopee correta da solicitação é `mavix.hub@gmail.com`, já cadastrada como Third-party e em análise. Uma sessão diferente, de perfil Registered Business Seller, foi inicialmente aberta durante a inspeção e foi excluída de todas as conclusões sobre status do formulário. O status e os valores efetivamente submetidos na conta correta ainda precisam ser conferidos em sessão autenticada dessa conta.

Nenhuma alteração foi feita no formulário, no deploy ou no banco durante esta auditoria.

## Parecer executivo

**Resultado: atendimento parcial, com bloqueadores de segurança e riscos de elegibilidade.**

O caminho do revisor está funcional: URL pública, HTTPS, login, papel `CLIENT`, abertura direta em Integrações, política de privacidade e apresentação honesta do estado Shopee. Porém, o projeto não deve ser classificado como plenamente aderente à Data Protection Policy enquanto persistirem os seguintes pontos:

1. registros Shopee e UPSeller com leitura anônima irrestrita;
2. endereços de entrega expostos ao papel `anon`;
3. milhares de pedidos com mais de 90 dias, em conflito com a política publicada e sem exceção legal documentada nesta auditoria;
4. access tokens e refresh tokens Shopee ainda armazenados em colunas de texto da tabela pública legada;
5. funções legadas ativas em produção e fluxo v3/Vault ainda não implantado;
6. UPSeller por XLSX/CSV não é confirmado pela documentação oficial como uma “integração de e-commerce” suficiente para elegibilidade Third-party.

Esses problemas podem não ser percebidos na navegação superficial do revisor, mas são materiais para conformidade contínua e para qualquer auditoria técnica da Shopee.

## Matriz de critérios do perfil

| Critério | Estado | Evidência / risco |
|---|---|---|
| Conta correta Third-party | Informado pelo titular; não reconfirmado | `mavix.hub@gmail.com` está em aprovação segundo o titular. É preciso conferir o status na sessão correta. |
| CNPJ/documento válido | Não comprovado nesta auditoria | O documento enviado não está armazenado no repositório. Conferir razão social e endereço exatamente contra o comprovante. |
| Produto live | Atendido | Produção pública responde HTTP 200. |
| HTTPS/TLS 1.2+ | Atendido | A URL aceita conexão forçada em TLS 1.2 e possui HSTS. |
| Acesso internacional | Provável, não comprovado de todas as regiões | Netlify é público e não há bloqueio geográfico no código; falta teste documentado fora do Brasil. |
| Conta teste funcional | Atendido | Login de `cliente@jvimports.com.br` validado em produção. A senha não é registrada neste relatório. |
| Entrada direta no roteiro do revisor | Atendido | `?review=shopee` abre a seção Integrações após a restauração da sessão. |
| Permissão de revisão | Atendido com ressalva | Papel `CLIENT`, associação `client` e importador oculto. A restrição é em parte de interface; políticas antigas ainda permitem ao usuário criar linhas próprias em algumas tabelas se a UI for contornada. |
| Integração existente visível | Atendido visualmente, elegibilidade não comprovada | UPSeller ETL aparece ativo com estoque, catálogo e kits. A Shopee não confirma publicamente que XLSX/CSV conta como integração de e-commerce. |
| Atualidade da integração | Fraco | Estoque atualizado em 26/05/2026; catálogo e kits em 14/04/2026. Em 16/07/2026, isso não sustenta bem a expressão “recent update timestamps”. |
| Serviços declarados | Coerentes se limitados | Product/Listing Management, Inventory Management e Data Analytics são demonstráveis. Marketing e outros serviços não devem ser selecionados sem evidência específica. |
| TikTok removido | Esperado no novo envio | A UI de revisão não apresenta TikTok. O valor efetivamente submetido deve ser confirmado na conta correta. |
| URL de revisão | Atendido | `https://ecommerce-control-jv.netlify.app/?review=shopee`. |
| Política de privacidade pública | Atendido na superfície | `/privacidade` e `/privacidade.html` respondem HTTP 200 e o link está na tela de login. A implementação real de retenção diverge do texto publicado. |
| PII não mascarada | Não solicitada, conforme orientação | Tipo mostra Penetration Test Report, mas sem arquivo. Pelo texto do formulário, isso não concede acesso a PII não mascarada. |
| Pentest/certificação | Não atendido como controle contínuo | Não há relatório. Isso é aceitável para não solicitar PII no formulário, mas a DPP ainda exige avaliações periódicas e permite que a Shopee solicite evidência externa. |
| Dados exatos do formulário | Não comprovado | Não existe recibo/cópia do novo envio no repositório e a sessão correta ainda não foi aberta. |
| Contato monitorado | Operacional | Confirmar monitoramento de `mavix.hub@gmail.com` e telefone durante toda a análise. |

## Evidências positivas verificadas

### Produção e experiência do revisor

- URL principal e política de privacidade respondem HTTP 200.
- Cabeçalhos presentes: CSP, HSTS, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, X-Frame-Options e `X-Robots-Tag`.
- Runtime config é carregado antes do SDK do Supabase.
- A conta teste mostra papel `CLIENT` e associação à conta `JV Imports` como `client`.
- O menu de importação não aparece para `CLIENT`.
- Integrações abre automaticamente e apresenta:
  - Shopee: `Fluxo de integração Shopee`, `Em acompanhamento`, duas lojas sem alegação de conexão ativa;
  - UPSeller ETL: ativo, com 276 registros de estoque, 94 de catálogo e 124 de kits.
- A interface não expõe Partner Key, access token ou refresh token ao revisor.

### Build e controles de publicação

- Build da allowlist passou com 23 arquivos públicos.
- Validador de release passou: conteúdo permitido, assets, ordem de scripts, cópia proibida e scanner de padrões de segredo.
- Contrato do frontend passou.
- Contrato do artefato de release passou.
- Verificação sintática de JavaScript passou.
- Edge Functions configuradas localmente usam `verify_jwt = true`, exceto callback público protegido por estado OAuth.

## Achados críticos de segurança

### CRIT-01 - Dados comerciais e PII acessíveis como `anon`

Apesar de todas as tabelas terem RLS ativado, há 23 políticas `SELECT TO anon USING (true)` em tabelas comerciais. A simulação com o papel `anon` retornou:

| Tabela | Linhas visíveis anonimamente |
|---|---:|
| `shopee_orders` | 7.193 |
| `shopee_order_items` | 7.325 |
| `shopee_returns` | 59 |
| `shopee_wallet_transactions` | 6.032 |
| `upseller_stock_snapshot` | 368 |
| `upseller_product_snapshot` | 94 |

`shopee_orders` contém `buyer_username`, `shipping_address`, `order_sn` e valores financeiros. Todos os 7.193 pedidos possuem `shipping_address` preenchido. Como a chave pública faz parte do frontend por desenho, um terceiro pode consultar a Data API sem autenticação se souber os endpoints.

**Impacto:** conflito direto com least privilege, segregação e proteção de dados da Shopee; risco LGPD; risco de reprovação ou ação corretiva em auditoria.

**Prioridade:** imediata. Revogar leitura anônima e remover políticas `Permitir leitura anonima ...` das tabelas comerciais, testando o frontend exclusivamente com usuário autenticado e associação de conta.

### CRIT-02 - Retenção real diverge da política publicada

A Política de Privacidade declara retenção de dados pessoais/restritos Shopee por no máximo 90 dias, salvo obrigação legal. No banco:

- pedido mais antigo: 08/11/2024;
- 6.278 pedidos têm mais de 90 dias;
- 7.193 pedidos possuem endereço de entrega.

**Impacto:** a declaração pública não corresponde ao comportamento atual. A DPP também limita retenção conforme necessidade e prazo aplicável.

**Prioridade:** imediata. Definir base legal/exceções documentadas, separar campos fiscais obrigatórios de PII operacional e implementar anonimização/expurgo automático verificável.

### CRIT-03 - Tokens Shopee legados em texto na tabela pública

Existem seis linhas de loja e todas possuem `access_token` e `refresh_token` nas colunas legadas de `public.shopee_shops`. O schema v3 com Vault foi aplicado, mas não possui autorizações/token links ativos:

- `shopee_authorizations`: 0;
- `private.shopee_authorization_tokens`: 0;
- `shopee_connections`: 2.

Além disso, funções legadas ativas ainda leem e escrevem tokens diretamente em `shopee_shops`.

**Impacto:** aumenta o raio de exposição de credenciais Shopee e contradiz a arquitetura v3 documentada.

**Prioridade:** imediata antes de conectar o novo app Third-party. Migrar autorizações para Vault, implantar v3 e remover/neutralizar colunas e funções legadas por migração compensatória revisada.

## Achados altos e médios

### HIGH-01 - Deriva entre repositório e produção

Produção mantém funções que não estão em `supabase/functions` local, enquanto funções v3 locais não estão implantadas. Funções legadas incluem `shopee-auth-start`, `shopee-auth-callback`, `shopee-auth`, `shopee-sync` e `shopee-sync-product-ads`.

As mudanças finais da submissão também estão sem commit no worktree. Um deploy automático futuro pode sobrescrever correções manuais ou publicar estado diferente do auditado.

### HIGH-02 - UPSeller pode não satisfazer elegibilidade de integração

O produto mostra um ETL controlado por XLSX/CSV. Isso é honesto e visível, mas as fontes oficiais não afirmam que importação de arquivo seja equivalente a uma integração de e-commerce existente. Como o motivo anterior citou explicitamente a integração declarada e ausente, este continua sendo o principal risco de aprovação do formulário.

Mitigação: manter descrição precisa, atualizar os dados do UPSeller e preparar evidência de uso real. Se a Shopee exigir integração API/canal, será necessário demonstrar outra integração real, sem selecionar uma plataforma apenas para satisfazer o campo.

### HIGH-03 - Dados do UPSeller estão antigos

O texto de Remarks fala em atualizações recentes, mas catálogo/kits têm cerca de três meses e estoque cerca de sete semanas. Isso pode parecer demo estática ou integração abandonada.

### HIGH-04 - Razão social/endereço precisam de conferência documental

O envio anterior registrava `JV IMPORTS LTDA` e endereço sem bairro/estado. O documento empresarial não está disponível em tamanho legível no repositório. A razão social e o endereço do novo formulário devem coincidir literalmente com o comprovante, não com nome fantasia.

### MED-01 - Segurança do Auth

O Security Advisor atual tem zero ERROR, dois WARN e dez INFO. Os WARN são:

- `pg_net` no schema `public`;
- proteção contra senhas vazadas desabilitada.

O advisor não detecta as políticas anon permissivas como erro, portanto seu resultado não deve ser usado isoladamente como certificado de segurança.

### MED-02 - Evidências obrigatórias contínuas não comprovadas

Não foram comprovados nesta auditoria:

- pentest/code review anual;
- scans trimestrais de vulnerabilidade;
- MFA em todo acesso remoto administrativo;
- inventário formal de ativos/fluxos;
- plano testado de incidente com comunicação em 24 horas;
- logs protegidos e retidos pelos períodos exigidos;
- contratos/controles de subprocessadores.

### LOW-01 - Qualidade visual

O texto `Catálogo` aparece como `CatÃ¡logo` no DOM da página de Integrações. Não bloqueia o fluxo, mas reduz a percepção de acabamento.

## Avaliação do formulário conhecido

### Security Report & Certification

Manter `Penetration Test Report` como tipo sem anexar arquivo é compatível com a instrução exibida pelo próprio formulário quando não se solicita PII não mascarada. Isso não equivale a possuir relatório e não deve ser descrito como certificação existente.

### Other e-commerce platforms

`UPSeller - live controlled XLSX/CSV ETL integration` é uma descrição factual. O risco não é de falsidade, mas de a Shopee não aceitar ETL de arquivo como “e-commerce integration”. Classificação: **não comprovado pelos critérios públicos**.

### Serviços

Seleção recomendada e demonstrável:

- Product/Listing Management;
- Inventory Management;
- Data Analytics.

Não declarar Marketing, Chat, PII ou serviços que o revisor não consiga localizar.

### URL, usuário e senha

- URL correta: `https://ecommerce-control-jv.netlify.app/?review=shopee`;
- usuário correto: `cliente@jvimports.com.br`;
- senha: validada, não registrada neste relatório;
- recomendação: rotacionar após a conclusão da análise, pois foi compartilhada na conversa por solicitação do titular.

## Plano recomendado por prioridade

### Nas próximas 24 horas

1. Confirmar na conta `mavix.hub@gmail.com` que o status está efetivamente `Under Review`/equivalente e salvar recibo ou captura sem senha.
2. Monitorar e-mail e telefone cadastrados.
3. Remover acesso anônimo a pedidos, endereços, retornos, finanças e UPSeller.
4. Definir contenção para PII com mais de 90 dias.
5. Não conectar o novo app a lojas até concluir migração dos tokens para Vault.

### Antes de qualquer auditoria técnica ou aprovação final

1. Implantar e validar o fluxo OAuth v3/Vault.
2. Desativar funções OAuth/sync legadas não reproduzidas pelo repositório.
3. Atualizar importação UPSeller com arquivo real e devidamente anonimizado.
4. Conferir razão social/endereço contra o documento submetido.
5. Commitar, revisar, executar CI e publicar as mudanças finais por fluxo reproduzível.
6. Ativar proteção contra senhas vazadas e revisar `pg_net`.

### Após aprovação

1. Criar app com tipo compatível com as APIs realmente necessárias.
2. Usar autorização oficial Shopee, sem crawler/API interna.
3. Manter sucesso médio diário de API em pelo menos 90% e atividade conforme Partner Rules.
4. Preparar screenshots, roteiro e evidências para Go-Live.
5. Manter programa contínuo de segurança, vulnerabilidade, incidentes e retenção.

## Conclusão

O formulário foi melhorado de maneira material em relação à reprovação anterior: TikTok foi removido, UPSeller foi descrito com precisão, a URL é live, a conta funciona, a interface não alega Shopee conectada e a política de privacidade está pública. Isso melhora consideravelmente a avaliação funcional.

Contudo, **não atendemos hoje a todos os pontos necessários de segurança e proteção de dados**. A exposição anônima, a retenção divergente e os tokens legados são bloqueadores técnicos reais. Também não há base oficial suficiente para garantir que UPSeller via XLSX/CSV cumpra sozinho o critério de integração de e-commerce. A aprovação continua possível porque a análise regional pode se concentrar na experiência e nos documentos, mas não é responsável afirmar conformidade total antes das correções acima.

## Fontes oficiais principais

- [Guia de perfil/app Third-party da Shopee](https://open.shopee.com/developer-guide/384)
- [Data Protection Policy](https://open.shopee.com/policy?policy_id=1)
- [Platform Partner Rules](https://open.shopee.com/policy?policy_id=2)
- [Terms of Service](https://open.shopee.com/agreement)
- [Guia de acesso a dados sensíveis](https://open.shopee.com/developer-guide/718)
