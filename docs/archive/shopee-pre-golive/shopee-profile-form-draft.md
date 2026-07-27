# Rascunho seguro do formulário Shopee

Não registrar a senha neste arquivo. Preencher os campos cadastrais diretamente a partir do comprovante oficial.

| Campo Shopee | Resposta recomendada |
|---|---|
| Developer Type | `Third-party Partner Platform` |
| Company's Legal Name | `JV IMPORTS LTDA` — conferir no documento |
| Business Registration Number | `53.642.321/0001-56` — conferir no documento |
| Business Registration Document | JPG/JPEG atual e legível |
| City/Town | Copiar exatamente do documento oficial |
| Address | Logradouro + número + complemento + bairro + estado, exatamente como no documento |
| Postal Code | Copiar exatamente do documento oficial |
| Country/Area | `Brazil` |
| Phone Number | Telefone monitorado durante toda a análise |
| Registered Contact Email | E-mail monitorado durante toda a análise |
| Data Protection Policy | Ler a versão vigente e marcar o aceite |
| What services do your app provide | Selecionar somente `Product/Listing Management`, gestão de estoque (se disponível) e `Data Analytics` |
| App URL | `https://ecommerce-control-jv.netlify.app/?review=shopee` — somente após publicação e teste final |
| Test account username | `cliente@jvimports.com.br` |
| Test account password | Colar a senha atualmente na área de transferência; não salvar neste arquivo |
| How many sellers are you supporting currently | `[NÚMERO REAL ATUAL]` |
| Other integrated platforms | `UPSeller — controlled XLSX/CSV ETL integration` |
| Security Report | Não declarar/anexar relatório inexistente; não solicitar PII não mascarada |

## App/service description

> Mavis is a multi-tenant operations hub for marketplace sellers. It centralizes product and inventory data, listing and advertising analysis, and operational dashboards. The reviewer account demonstrates an active controlled XLSX/CSV ETL workflow with UPSeller and the user-facing Shopee connection workflow. It is read-only and contains synthetic data without real customer PII.

## Remarks

> Mavis is a live multi-tenant operations hub for marketplace sellers, operated by JV IMPORTS LTDA. Sign in with the dedicated test account; the system opens the Integrations page automatically. The reviewer can verify the Shopee integration workflow and the active UPSeller controlled XLSX/CSV ETL, including modules, record counts and recent update timestamps. The account is read-only, requires no installation or additional login, and contains no real customer personal data. We do not request access to unmasked PII.

## Roteiro do revisor

1. Open the App URL.
2. Sign in with the dedicated test credentials.
3. The Integrations page opens automatically.
4. Review the Shopee connection workflow and status.
5. Review the active UPSeller ETL modules, record counts and recent update timestamps.
6. Sign out using `Desconectar`.
