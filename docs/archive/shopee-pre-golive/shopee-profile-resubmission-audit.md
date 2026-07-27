# Auditoria para reenvio do perfil Shopee Third-party

Data da auditoria: 15/07/2026. Fonte principal: [guia oficial de perfil da Shopee](https://open.shopee.com/developer-guide/384), atualizado em 03/07/2026. Detalhamento das políticas e demais fontes oficiais: [pesquisa completa](./shopee-third-party-approval-criteria-research.md).

## Diagnóstico da reprovação anterior

O motivo material exibido pela Shopee foi a ausência, no produto, da integração declarada como **TikTok**. Os PDFs também revelam quatro riscos: endereço incompleto (sem bairro e estado), senha de teste exposta no próprio material, seleção de tipo de relatório de pentest sem arquivo e uso de uma URL de produção que ainda não contém as correções validadas no preview.

## Matriz de prontidão

| Critério | Estado | Evidência / ação necessária |
|---|---|---|
| Perfil Third-party | Pronto no planejamento | Selecionar `Third-party Partner Platform`. |
| CNPJ e razão social | Conferir antes do envio | Copiar exatamente do comprovante atual. |
| Documento empresarial | Pendente do titular | Exportar/obter JPG ou JPEG atual e legível. |
| Endereço completo | Correção necessária | Incluir logradouro, número, complemento, bairro, estado e CEP conforme documento. |
| Produto ativo | Pronto | Release publicado no domínio definitivo em 15/07/2026. |
| Integração visível | Pronto | Produção reconhece duas lojas Shopee em estado inativo e UPSeller ETL ativo com três módulos. A interface não alega conexão Shopee ativa antes da aprovação. |
| Shopee sem credenciais | Condição esperada | Mostrar o fluxo e o estado “em acompanhamento”; não alegar loja conectada antes da aprovação. |
| URL de login | Pronto | `https://ecommerce-control-jv.netlify.app/?review=shopee`. |
| HTTPS/TLS 1.2 | Aprovado tecnicamente | Produção e preview responderam HTTP 200 forçando TLS 1.2 em 15/07/2026. |
| Cabeçalhos de segurança | Pronto no preview | CSP, HSTS, Permissions-Policy, Referrer-Policy, X-Content-Type-Options e frame protection presentes. |
| Conta do revisor | Pronta em produção | Perfil `CLIENT`, associação `client`, login e bootstrap de Integrações validados. |
| Senha do revisor | Pronto | Senha forte rotacionada, sessões antigas revogadas e credencial deixada somente na área de transferência do titular. |
| TikTok | Remover | Não existe evidência no produto. Não declarar. |
| UPSeller | Declarar com precisão | Integração por ETL controlado XLSX/CSV, não por API. Preferir uma importação real anonimizada antes do envio. |
| Serviços do app | Restringir | Marcar apenas produto/listagem, estoque e analytics que estejam visíveis. |
| PII não mascarada | Não solicitar | Conta de avaliação usa dados sintéticos; não afirmar necessidade de PII. |
| Pentest | Não declarar documento inexistente | O tipo selecionado anteriormente não tinha anexo. Manter programa de segurança e planejar avaliação anual conforme DPP. |
| Política de Privacidade | Pronta | Publicada em `/privacidade.html` e vinculada na tela de login. |
| Acesso fora do Brasil | Pendente de evidência externa | Netlify é público; testar em rede/VPN externa imediatamente antes do envio. |
| E-mail e telefone | Pendente operacional | Confirmar que são monitorados e responder rapidamente à Shopee. |
| Quantidade de sellers | Pendente do titular | Informar o número real atual; não repetir automaticamente “1–100”. |

## Conclusão

O sistema está tecnicamente preparado em produção. Permanecem sob responsabilidade do titular: conferir documento/endereço oficial, informar o número real de sellers, colar a senha diretamente no formulário e validar acesso por uma rede externa. O advisor de produção ficou com zero `ERROR`, dois `WARN` e dez `INFO`; os avisos restantes são extensão `pg_net` no schema público e proteção de senhas vazadas desabilitada. A aprovação continua sendo decisão da Shopee; esta auditoria reduz as inconsistências observáveis, sem prometer o resultado.
