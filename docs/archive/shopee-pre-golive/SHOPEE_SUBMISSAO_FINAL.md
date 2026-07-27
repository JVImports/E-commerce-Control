# Submissão final do perfil Shopee Third-party

Atualizado em 15/07/2026.

## Estado do sistema

- Produção: `https://ecommerce-control-jv.netlify.app/?review=shopee`
- Política de Privacidade: `https://ecommerce-control-jv.netlify.app/privacidade.html`
- Conta de avaliação: `cliente@jvimports.com.br`
- Papel: `CLIENT`, acesso somente leitura.
- A senha forte foi rotacionada, as sessões antigas foram revogadas e a senha foi colocada na área de transferência do Windows. A senha não está armazenada neste projeto.
- Login de produção, papel, associação à conta e bootstrap de Integrações foram validados.
- Shopee: duas lojas reconhecidas, apresentadas como fluxo inativo enquanto não há aprovação/credenciais do novo app.
- UPSeller: integração ETL ativa, com três módulos.
- HTTPS forçando TLS 1.2: HTTP 200.
- Security Advisor pós-hardening: zero `ERROR`, dois `WARN` e dez `INFO`.
- Build, allowlist de publicação e scanner de credenciais: aprovados.

Os dois avisos restantes são `pg_net` instalado no schema `public` e proteção contra senhas vazadas desabilitada no Auth. Eles não impediram o login nem o fluxo do revisor, mas devem permanecer no backlog de segurança.

## Campos do formulário

| Campo | Preenchimento |
|---|---|
| Developer Type | `Third-party Partner Platform` |
| Company's Legal Name | `JV IMPORTS LTDA` — confirmar no documento oficial |
| Business Registration Number | `53.642.321/0001-56` — confirmar no documento oficial |
| Business Registration Document | Comprovante atual e legível em JPG/JPEG |
| City/Town | Copiar exatamente do comprovante oficial |
| Address | Logradouro, número, complemento, bairro e estado exatamente como no comprovante |
| Postal Code | Copiar exatamente do comprovante oficial |
| Country/Area | `Brazil` |
| Phone Number | Telefone monitorado durante a análise |
| Registered Contact Email | E-mail monitorado durante a análise |
| Data Protection Policy | Ler a versão vigente e marcar o aceite |
| Services | Product/Listing Management, Inventory Management e Data Analytics, quando disponíveis |
| App URL | `https://ecommerce-control-jv.netlify.app/?review=shopee` |
| Test username | `cliente@jvimports.com.br` |
| Test password | Colar a senha segura; não inserir em arquivos, prints ou vídeo |
| Supported sellers | Selecionar `1–100` apenas se houver ao menos um seller real atendido |
| Other platforms | `UPSeller — controlled XLSX/CSV ETL integration` |
| Unmasked PII | Não solicitar |
| Security Report | Não declarar ou anexar relatório inexistente |

Não informar TikTok e não afirmar integração UPSeller por API.

## App/service description

> Mavis is a multi-tenant operations hub for marketplace sellers. It centralizes product and inventory data, listing and advertising analysis, and operational dashboards. The reviewer account demonstrates an active controlled XLSX/CSV ETL workflow with UPSeller and the user-facing Shopee connection workflow. It is read-only and does not expose customer personal data.

## Remarks

> Mavis is a live multi-tenant operations hub for marketplace sellers, operated by JV IMPORTS LTDA. Sign in with the dedicated test account; the system opens the Integrations page automatically. The reviewer can verify the Shopee integration workflow and the active UPSeller controlled XLSX/CSV ETL, including modules, record counts and recent update timestamps. The account is read-only, requires no installation or additional login, and does not expose customer personal data. We do not request access to unmasked PII.

## Antes de clicar em Submit

1. Conferir razão social, CNPJ, município, endereço completo e CEP contra o comprovante.
2. Confirmar a quantidade real de sellers.
3. Testar as credenciais em janela anônima e, se possível, em rede externa ao Brasil.
4. Preparar screenshots e vídeo sem senha ou PII.
5. Monitorar telefone e e-mail cadastrados durante a análise.

Referências: [guia oficial de perfil](https://open.shopee.com/developer-guide/384), [Data Protection Policy](https://open.shopee.com/policy?policy_id=1) e [Platform Partner Rules](https://open.shopee.com/policy?policy_id=2).
