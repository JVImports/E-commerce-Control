# Parecer final — aprovação Shopee Third-party

Data da análise: 16/07/2026
Conta correta da solicitação: `mavix.hub@gmail.com`
Produto analisado: Mavis / Projeto Controle JV

## Conclusão executiva

O projeto está funcionalmente bem preparado para a avaliação da Shopee, mas ainda não atende integralmente aos requisitos de segurança e proteção de dados.

A análise considera exclusivamente a conta `mavix.hub@gmail.com`, cadastrada como Third-party e informada pelo titular como estando em aprovação. A sessão da conta `jvimports.vendas@gmail.com`, classificada como Business Seller, foi desconsiderada. O protocolo e os valores finais enviados ainda precisam ser conferidos diretamente em uma sessão autenticada da conta correta.

**Parecer:** a demonstração funcional está convincente, porém o sistema não deve ser classificado como plenamente conforme enquanto não forem corrigidos os achados críticos de acesso anônimo, retenção de dados e armazenamento legado de tokens.

## Pontos atendidos

- Plataforma publicada e acessível por HTTPS/TLS 1.2.
- URL de revisão funcionando: `https://ecommerce-control-jv.netlify.app/?review=shopee`.
- Login do usuário revisor validado.
- Abertura direta da área de Integrações.
- UPSeller apresentado como integração ativa, sem alegação falsa de conexão Shopee.
- TikTok removido da demonstração planejada para o novo formulário.
- Política de privacidade disponível publicamente.
- Cabeçalhos de segurança configurados.
- Build, validação do release, contratos do frontend e sintaxe JavaScript aprovados.
- Partner Key, access token e refresh token não aparecem na interface do revisor.
- A ausência de arquivo de pentest é compatível com a decisão de não solicitar acesso a PII não mascarada pelo formulário.

## Bloqueadores técnicos

### 1. Dados acessíveis sem autenticação

Foram encontradas 23 políticas que permitem leitura como papel `anon`. Nos testes, uma requisição sem usuário autenticado conseguiu consultar:

| Conteúdo | Registros visíveis |
|---|---:|
| Pedidos Shopee | 7.193 |
| Itens de pedidos | 7.325 |
| Devoluções | 59 |
| Transações da carteira | 6.032 |
| Estoque UPSeller | 368 |
| Produtos UPSeller | 94 |

Os pedidos incluem campos como usuário do comprador, endereço de entrega, número do pedido e valores financeiros.

**Impacto:** risco grave de segurança, LGPD, violação de menor privilégio e possível não conformidade com a Data Protection Policy da Shopee.

**Ação:** remover imediatamente as políticas de leitura anônima das tabelas comerciais e validar o sistema apenas com usuário autenticado e autorizado.

### 2. Retenção incompatível com a política publicada

A política de privacidade informa retenção de dados pessoais e restritos da Shopee por no máximo 90 dias, salvo obrigação legal. Entretanto:

- há pedidos desde 08/11/2024;
- 6.278 pedidos têm mais de 90 dias;
- 7.193 pedidos ainda possuem endereço de entrega.

**Impacto:** o comportamento do banco não corresponde ao texto publicado.

**Ação:** documentar a base legal aplicável, separar informações fiscais obrigatórias de PII operacional e implementar anonimização ou expurgo automático verificável.

### 3. Tokens Shopee no armazenamento legado

As seis lojas cadastradas ainda possuem `access_token` e `refresh_token` em colunas de texto da tabela legada `public.shopee_shops`. O modelo v3 com Vault existe no schema, mas ainda não está sendo utilizado pelas autorizações atuais.

**Impacto:** maior risco de exposição das credenciais das lojas e divergência da arquitetura segura planejada.

**Ação:** migrar as autorizações para Vault, implantar o fluxo OAuth v3 e neutralizar as colunas e funções legadas.

### 4. Diferença entre repositório e produção

Funções antigas de autenticação e sincronização continuam implantadas, enquanto o fluxo OAuth v3/Vault desenvolvido localmente ainda não está em produção. Também existem mudanças relevantes sem commit.

**Impacto:** um novo deploy pode publicar um estado diferente do auditado ou reverter correções manuais.

**Ação:** reconciliar produção e repositório, executar testes, versionar as mudanças e publicar por um processo reproduzível.

## Riscos relacionados ao formulário

### Integração existente

A Shopee exige que o produto esteja ativo e possua integrações de e-commerce existentes. O UPSeller está demonstrado como um ETL controlado por arquivos XLSX/CSV, mas a documentação oficial não confirma que uma importação por arquivo, isoladamente, seja suficiente para cumprir esse requisito.

Esse é o principal risco de elegibilidade do formulário. A descrição deve continuar factual; uma plataforma não deve ser selecionada apenas para satisfazer o campo.

### Atualidade da demonstração

Os dados apresentados na área de Integrações estão antigos:

- estoque: 26/05/2026;
- catálogo e kits: 14/04/2026.

Isso pode transmitir a impressão de integração estática ou inativa. Recomenda-se atualizar a demonstração com dados reais e devidamente protegidos.

### Permissões da conta revisora

A conta revisora tem perfil limitado e esconde funções de importação. A restrição reduz riscos operacionais, mas pode conflitar com a exigência de que todos os recursos declarados estejam habilitados para avaliação.

O revisor deve conseguir localizar e compreender todas as funções marcadas no formulário, ainda que operações destrutivas permaneçam protegidas.

### Dados empresariais

A razão social e o endereço precisam coincidir literalmente com o documento empresarial enviado. Como não há uma cópia imutável do novo formulário no repositório, esses campos não puderam ser comprovados nesta auditoria.

Deve-se conferir especialmente:

- razão social, sem usar nome fantasia no lugar;
- CNPJ;
- logradouro e número;
- complemento;
- bairro;
- cidade e estado;
- CEP.

### Serviços declarados

Os serviços mais claramente demonstráveis são:

- Product/Listing Management;
- Inventory Management;
- Data Analytics.

Marketing, Chat, acesso a PII ou outras categorias não devem ser declarados se o revisor não conseguir localizar e testar as funções correspondentes.

## Security Report & Certification

Manter `Penetration Test Report` como tipo, sem anexar um arquivo, é compatível com o texto do formulário quando não se solicita acesso a PII não mascarada. Isso não significa que a empresa possua uma certificação ou relatório de pentest.

Pelas regras oficiais atuais, o pentest não aparece como requisito regional obrigatório apenas para cadastrar um parceiro brasileiro que não solicita PII não mascarada. Entretanto, avaliações periódicas de segurança, revisão de código e controles contínuos continuam fazendo parte das obrigações de proteção de dados e podem ser solicitados pela Shopee.

## Ordem recomendada de correção

### Imediatamente

1. Remover o acesso anônimo aos pedidos, endereços, devoluções, finanças e dados UPSeller.
2. Conter, anonimizar ou justificar formalmente os dados pessoais com mais de 90 dias.
3. Não conectar o novo aplicativo Third-party a lojas antes de proteger os tokens.
4. Conferir o protocolo e o status diretamente na conta `mavix.hub@gmail.com`.
5. Monitorar o e-mail e o telefone cadastrados durante toda a análise.

### Antes de conectar o novo app ou passar por auditoria técnica

1. Migrar tokens para Vault.
2. Implantar e validar o OAuth v3.
3. Desativar funções OAuth e sincronizações legadas.
4. Atualizar a demonstração do UPSeller.
5. Conferir razão social e endereço contra o documento enviado.
6. Versionar as mudanças, executar o CI e publicar por fluxo reproduzível.
7. Ativar proteção contra senhas vazadas e revisar a extensão `pg_net` no schema público.

### Após a aprovação

1. Criar o aplicativo apenas com as APIs necessárias.
2. Utilizar exclusivamente o fluxo oficial de autorização da Shopee.
3. Manter sucesso médio diário das APIs em pelo menos 90%.
4. Preparar roteiro e evidências para a avaliação de Go-Live.
5. Manter programa contínuo de segurança, vulnerabilidades, incidentes e retenção.
6. Rotacionar a senha da conta de revisão depois que a análise for encerrada.

## Resultado final

O formulário foi melhorado significativamente em relação à tentativa anterior: o TikTok foi removido, o UPSeller foi descrito com mais precisão, a URL está live, o acesso funciona, a tela não afirma que a Shopee já está conectada e a política de privacidade está pública.

A aprovação continua possível, pois a avaliação regional também considera documentos, experiência do revisor e critérios internos não publicados. Porém, não é responsável afirmar que todos os pontos estão atendidos antes da correção dos bloqueadores técnicos.

## Relatórios de apoio

- `docs/SHOPEE_AUDITORIA_POS_SUBMISSAO_2026-07-16.md`
- `docs/shopee-post-submission-official-criteria.md`

## Fontes oficiais

- [Guia de perfil e aplicativo Third-party](https://open.shopee.com/developer-guide/384)
- [Data Protection Policy](https://open.shopee.com/policy?policy_id=1)
- [Platform Partner Rules](https://open.shopee.com/policy?policy_id=2)
- [Terms of Service](https://open.shopee.com/agreement)
- [Guia de acesso a dados sensíveis](https://open.shopee.com/developer-guide/718)

---

Nenhuma alteração no formulário, no banco de produção ou no deploy foi realizada durante esta auditoria.
