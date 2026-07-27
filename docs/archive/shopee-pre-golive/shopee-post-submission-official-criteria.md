# Auditoria pós-submissão — critérios oficiais Shopee Third-party Partner Platform
Data da análise: 16/07/2026.

## Conclusão executiva

**Veredito: atendimento parcial, com boa preparação técnica, mas sem base para afirmar conformidade integral ou aprovação provável.** O formulário documentado cobre corretamente quase todos os campos públicos do perfil Third-party e o Mavis apresenta URL live, conta de teste, HTTPS/TLS, política de privacidade e funções demonstráveis. Permanecem dois riscos materiais de elegibilidade:

1. a Shopee exige uma integração de e-commerce existente e identificável, mas não define se um ETL controlado por XLSX/CSV com o UPSeller satisfaz esse conceito; portanto, esse requisito está **não comprovado**, não “atendido”;
2. a conta de revisão foi planejada como somente leitura, enquanto o guia manda habilitar todos os recursos para teste; se a Shopee não puder testar os recursos de gestão declarados, poderá considerar a conta insuficiente.

Além disso, a política de privacidade pública e o hardening técnico não substituem o programa formal e contínuo de segurança exigido pela DPP. Não há evidência documental suficiente no repositório de Security Officer, plano completo de incidentes, scans trimestrais, avaliação anual/pentest, retenção comprovada de logs e descarte automatizado de dados.

Esta análise não promete aprovação: o próprio guia informa que o time regional aplica critérios e diretrizes internas, além dos critérios públicos. [Guia oficial brasileiro, seção 1](https://open.shopee.com/developer-guide/384)

## Escopo e confiabilidade das evidências

Foram usados apenas documentos oficiais da Shopee e arquivos locais do projeto. A comparação do formulário se baseia em `docs/SHOPEE_SUBMISSAO_FINAL.md`, `docs/shopee-profile-form-draft.md`, `docs/shopee-resubmission-runbook.md` e `docs/shopee-profile-resubmission-audit.md`. Não há no repositório uma exportação imutável da versão efetivamente enviada; por isso, valores que dependem do preenchimento final pelo titular — documento, endereço, quantidade de sellers, telefone, e-mail e senha — ficam classificados como **não verificáveis pós-envio**.

Não foi usado como evidência nenhum outro perfil Shopee que não seja a conta Third-party submetida.

## 1. Requisitos públicos obrigatórios para aprovação do perfil

Segundo o guia brasileiro, uma Third-party Partner Platform deve ter CNPJ e documentos empresariais válidos; produto ativo; integrações de e-commerce existentes identificáveis por conta teste; URL e credenciais ativas com todos os recursos habilitados; URL comercial em HTTPS/TLS 1.2; e produto acessível fora do Brasil. O produto não pode envolver atividades suspeitas, como venda de contas internacionais ou extração de anúncios para transações fora da Shopee. [Guia oficial brasileiro, “Modelos de desenvolvimento e elegibilidade”](https://open.shopee.com/developer-guide/384)

Todos os campos do perfil são obrigatórios: razão social, CNPJ, documento empresarial JPG/JPEG, cidade, endereço completo — logradouro, número, complemento, bairro e estado —, CEP, Brasil, telefone do desenvolvedor, e-mail principal e aceite da DPP. A segunda etapa exige serviços, URL de login, usuário e senha de teste, número atual de clientes/sellers, outras plataformas/canais integrados e `Remarks`. [Guia oficial brasileiro, “Criação do perfil de desenvolvedor”](https://open.shopee.com/developer-guide/384)

### Matriz do formulário e produto documentados

| Critério oficial | Evidência local | Estado | Avaliação |
|---|---|---:|---|
| Tipo `Third-party Partner Platform` | Formulário final documenta esse tipo | Atende no rascunho | Confirmar apenas pelo status da conta submetida; não inferir a partir de outra conta Shopee. |
| CNPJ e documento válidos | CNPJ documentado; anexo ficou a cargo do titular | Não verificável | Divergência entre dado digitado e documento é motivo oficial de reprovação. |
| Razão social exata | Arquivos sugerem `JV IMPORTS LTDA`, sempre com ressalva de conferência | Não verificável / risco alto | Deve coincidir literalmente com o comprovante enviado; nome fantasia não substitui razão social. |
| Endereço completo | Documentação instrui incluir bairro e estado | Não verificável | Sem cópia final submetida, não é possível confirmar correção do problema anterior. |
| Produto live | URL de produção e release de 15/07/2026 documentados | Atende com evidência interna | Deve permanecer estável e acessível durante toda a análise. |
| HTTPS/TLS 1.2+ | Teste HTTP 200/TLS 1.2 e headers documentados | Atende com evidência interna | É critério explícito e também obrigação da DPP 10.5. |
| Acesso fora do Brasil | Netlify é público; teste externo ficou pendente/recomendado | Não comprovado | O guia exige que seja possível logar fora do Brasil, sem indicar um país específico. |
| Conta de teste válida | Usuário dedicado, login e redirecionamento para Integrações documentados | Atende com evidência interna | Manter senha válida, sem MFA/CAPTCHA dependente do titular e sem expiração durante a análise. |
| Todos os recursos habilitados | Conta planejada como `CLIENT`, somente leitura | Risco material | Se controles necessários para demonstrar “gestão” estiverem ocultos ou bloqueados, pode conflitar com a exigência de recursos habilitados. |
| Serviços declarados são visíveis | Produto/listagens, estoque e analytics constam do produto | Atende parcialmente | Só é seguro marcar módulos que o revisor consiga realmente abrir e compreender. |
| Integração e-commerce existente e identificável | UPSeller mostrado como ETL XLSX/CSV, com módulos, contagens e timestamps | **Não comprovado** | A fonte oficial não define importação de arquivo como integração; UPSeller é integrador/hub, não necessariamente um canal de e-commerce. |
| Quantidade atual de sellers | Preenchimento deixado ao titular | Não verificável | Não há mínimo público para Third-party; informar o número real, sem inflar faixa. |
| E-mail e telefone monitorados | Runbook exige monitoramento | Pendente operacional | A ausência de resposta no prazo é motivo oficial de reprovação. |
| Aceite da DPP | Previsto no formulário | Obrigatório | O aceite vincula a empresa às obrigações contínuas; não é apenas uma formalidade do formulário. |
| Nenhuma atividade proibida | Não há crawler, Chat abusivo, venda de contas ou brushing documentados | Sem indício de violação | Manter o uso exclusivamente pelas APIs oficiais e autorizações OAuth. |

### Risco central: UPSeller via arquivo

O guia usa duas formulações: o produto deve ter “integrações de e-commerce existentes” e o campo pergunta com quais outras “plataformas/canais” o sistema está integrado. Ele não impõe API nem proíbe ETL por arquivo. Contudo, também não afirma que uma importação XLSX/CSV de outro ERP/hub seja suficiente. [Guia oficial brasileiro](https://open.shopee.com/developer-guide/384)

Assim, a descrição `UPSeller — controlled XLSX/CSV ETL integration` é honesta e reduz o risco de alegação falsa, mas **não elimina o risco de elegibilidade**. O revisor pode concluir que o UPSeller não é uma plataforma de e-commerce ou que upload/importação não constitui integração. O produto deve continuar exibindo claramente origem, módulos importados, última execução, contagens e resultado do processamento, sem sugerir API inexistente. Se a Shopee pedir esclarecimento, a resposta deve explicar o fluxo real e não ampliar a alegação.

### Conta somente leitura versus “todos os recursos habilitados”

A conta read-only protege contra alterações e exposição de dados, mas a Shopee pede expressamente que todos os recursos estejam habilitados para teste. [Guia oficial brasileiro](https://open.shopee.com/developer-guide/384) Se o formulário declarou `Product/Listing Management` ou `Inventory Management`, apenas visualizar dashboards pode não demonstrar “management”. O estado mais defensável é uma demonstração segura, com dados sintéticos, que permita percorrer integralmente os fluxos declarados sem afetar lojas reais. Como o formulário já foi enviado, o mínimo é preservar a conta atual, garantir que todos os menus declarados abram e preparar explicação imediata se o revisor solicitar capacidade de teste adicional.

## 2. Exatidão e consistência das informações

As Platform Partner Rules proíbem ocultar informação comercial, fornecer dados inexatos e oferecer serviços diferentes da descrição submetida. Mudanças em serviços, ativos ou infraestrutura devem ser refletidas nos detalhes do app. [Platform Partner Rules, seção 4](https://open.shopee.com/policy?policy_id=2) Os Terms também exigem que as informações da conta sejam verdadeiras, exatas e mantidas atualizadas. [Terms of Service, cláusula 2.1](https://open.shopee.com/agreement)

Para o Mavis, isso implica:

- não declarar TikTok ou qualquer canal que não esteja identificável no produto;
- não chamar o UPSeller de integração por API;
- não dizer que uma nova integração Shopee Third-party está conectada antes da aprovação/autorização correspondente;
- manter separado o uso interno de qualquer app `Seller In House System` e o futuro app Third-party; um app interno não deve ser apresentado como autorização para atender outros sellers;
- fazer razão social, CNPJ, documento, endereço e CEP coincidirem integralmente;
- manter serviços selecionados, descrição, interface e screenshots coerentes entre si.

Há uma inconsistência interna a resolver no material operacional: `docs/mavis-release-runbook.md` pede uma loja Shopee ativa e sync com menos de 24 horas, enquanto os documentos de submissão dizem que a interface deve mostrar o novo fluxo como inativo/em acompanhamento até a aprovação. Para a revisão Third-party, a comunicação mais segura é a segunda: mostrar honestamente o fluxo disponível, sem atribuir ao novo app uma conexão que ele ainda não possui.

## 3. PII não mascarada e pentest — o que é realmente obrigatório

O guia oficial de dados sensíveis, atualizado em 13/07/2026, esclarece que nome, telefone, e-mail e endereço ficam **mascarados por padrão**. Para pedir dados não mascarados:

- whitelist de IP dos servidores é obrigatória para todos os desenvolvedores;
- o relatório de pentest como requisito de elegibilidade é listado para ISVs que atendem ou pretendem atender Tailândia, Malásia, Singapura ou Filipinas, além de China Cross-Border e Hong Kong Cross-Border;
- o Brasil não aparece nessa lista regional;
- quando exigido, o relatório é submetido no Console, costuma ser analisado em até dez dias úteis e o acesso aprovado vale por dois anos desde a emissão. [Requesting Access to Sensitive Data](https://open.shopee.com/developer-guide/718)

Portanto, para o Mavis Brasil sem necessidade de PII não mascarada, **não há base oficial para marcar ou anexar um relatório inexistente como condição do perfil**. A escolha documentada de não solicitar PII não mascarada é adequada. Isso não elimina as obrigações gerais da DPP:

- aplicações expostas à internet que coletam, transmitem ou exibem Shopee Content devem passar por avaliação anual e em major releases, incluindo pentest e code review (DPP 6.4);
- a avaliação deve ser conduzida por terceiro qualificado, ou internamente apenas com equipe treinada e processo aprovado por escrito pela Shopee (DPP 6.6);
- mediante aviso razoável, a Shopee pode exigir relatório de pentest produzido por fornecedor aprovado e pago pelo desenvolvedor (DPP 8.4). [Data Protection Policy](https://open.shopee.com/policy?policy_id=1)

A distinção correta é: **upload de relatório no Console para desbloquear PII** é condicional por escopo/região; **avaliação de segurança/pentest operacional** é obrigação contínua quando o app processa Shopee Content; **entrega de relatório específico à Shopee** também pode ser exigida sob solicitação.

## 4. Lacunas de segurança e privacidade frente à DPP

A DPP aplica-se desde o acesso à Open Platform e enquanto houver posse/acesso a Protected Data. [DPP, cláusulas 1.1 e 15](https://open.shopee.com/policy?policy_id=1) A política pública do Mavis ajuda e contém controles relevantes — papéis, segregação lógica, TLS, eventos e retenção máxima de 90 dias —, mas uma declaração pública não prova implementação.

| Obrigação DPP | Evidência local | Avaliação |
|---|---|---|
| Programa escrito de privacidade e segurança; Security Officer sênior (4.1–4.4) | Política pública e runbooks pontuais | Lacuna documental: não foi localizado programa completo nem designação formal. |
| Menor privilégio, controle granular e papel exclusivo para PII (4.6) | RLS, papéis e reviewer read-only documentados | Parcialmente atendido; precisa evidência consolidada por função/dado. |
| Logs de acesso, autorização, intrusão e configuração; sem PII; retenção mínima de 90 dias; alertas (4.7) | Logs de sync e runbook de correlação | Não comprovado em todo o escopo exigido. |
| Contas individuais; revogação em 24h; revisão anual; 2FA remoto (5.2–5.7) | Auth e revogação da conta de review documentados | Parcial; revisão anual e 2FA de acesso administrativo não estão evidenciados. |
| Firewall, IDS/IPS, segmentação; logs por 1 ano (5.8) | Provedores gerenciados e hardening | Não comprovado por evidência consolidada/SLA dos provedores. |
| Arquitetura, data flows, secure coding e ambientes separados; nenhum Protected Data em não-prod (6.1–6.2) | Documentação OAuth e separação de variáveis preview/prod | Parcial; falta diagrama/inventário completo e prova de ausência de dados protegidos fora de produção. |
| Scans trimestrais e após mudanças; high risk em até 90 dias (6.3) | Security Advisor pontual | Não comprovado como programa recorrente. |
| Avaliação anual e major release, incluindo pentest/code review (6.4–6.6) | Nenhum relatório declarado | Lacuna atual a planejar antes de processar Shopee Content em escala. |
| Patches críticos em até 30 dias (6.7) | Sem política/registro consolidado | Não comprovado. |
| Inventário/declaracão de ativos em até 10 dias quando solicitado (8.1) | Ativos Supabase/Netlify conhecidos | Falta inventário formal pronto para entrega. |
| Incidente com risco a Shopee Content: aviso a `ssrc@sea.com` em até 24h (9.1) | Runbook de rollback registra incidentes | Parcial; falta procedimento explícito de notificação Shopee em 24h. |
| Segregação, TLS, senha com hash/salt, PII/restricted data no máximo 90 dias e descarte irrecuperável (10.1–10.7) | Política pública declara esses princípios | Implementação de expurgo automático e prova de descarte não foram demonstradas. |
| Subprocessadores e transferências internacionais (14.3) | Netlify e Supabase fazem parte da infraestrutura | Revisar contratos, regiões, subprocessadores e base legal; não comprovado no repositório. |

Os Terms também exigem uma arquitetura de alto nível com funções, módulos, dependências e data flows, autorizam testes regulares de segurança pela Shopee e exigem, quando fornecida, a devolução assinada da `Data Protection Compliance Statement` em até 14 dias. [Terms of Service, cláusulas 4.1(b), 4.2 e 8.2(d)](https://open.shopee.com/agreement)

## 5. Regras de comportamento, APIs e operação contínua

As Platform Partner Rules proíbem crawler de dados Shopee, abuso de API interna, fraude de fulfillment, ferramentas de evasão, funções proibidas de Chat API, venda de contas/lojas falsas, migração unilateral de anúncios para concorrentes, brushing e concorrência desleal. Também proíbem uso/coleta/vazamento ilegal de dados, exposição de segredos do app e ocultação de vulnerabilidades ou ativos. [Platform Partner Rules, seções 2–3](https://open.shopee.com/policy?policy_id=2)

Após a criação do app, aplicam-se metas contínuas:

- entrar em Live até 90 dias consecutivos da criação;
- fazer pelo menos uma chamada API nos 90 dias após o Live;
- manter sucesso médio diário de chamadas em pelo menos 90%, considerando sucesso como HTTP 200 com `error` e `message` vazios; APIs públicas ficam fora do cálculo. [Platform Partner Rules, seção 5](https://open.shopee.com/policy?policy_id=2)

O guia antigo de saúde da integração ainda menciona 80%, criando uma inconsistência documental. Deve prevalecer 90%, por ser a regra normativa mais recente. [Integration Health Rules for Developer](https://open.shopee.com/developer-guide/271) · [Platform Partner Rules](https://open.shopee.com/policy?policy_id=2)

O desenho local que mantém `partner_key`, access token, refresh token e `service_role` fora do front-end é coerente com a obrigação de proteger credenciais. É indispensável preservar essa separação e usar somente OAuth/API oficial, sem reaproveitar um app interno para prestar serviço Third-party.

## 6. Etapas que só se aplicam depois da aprovação do perfil

A aprovação do perfil não é o Go-Live do app. Depois do perfil aprovado, a criação do app exige `App Type`, `App Name`, região Brasil, descrição e logo. O tipo escolhido determina APIs/endpoints, e o guia alerta que não há liberações manuais adicionais; se necessário, devem ser criados apps distintos. [Guia oficial brasileiro, “Criação do aplicativo”](https://open.shopee.com/developer-guide/384)

Quando o app estiver testado e pronto para Live, o pedido exige link, usuário e senha da conta teste, breve instrução e de 1 a 10 screenshots. A resposta automática em 24–48 horas refere-se a esse Go-Live, não à verificação do perfil. [Guia oficial brasileiro](https://open.shopee.com/developer-guide/384)

Antes de criar o app, é necessário mapear endpoints por módulo e decidir o `App Type` correto. Para o Mavis, também devem estar prontos: arquitetura de alto nível, inventário de ativos, política de retenção/expurgo, plano de incidentes e evidência de testes de segurança.

## 7. Conduta pós-submissão recomendada

1. Não reenviar nem alterar alegações enquanto a solicitação estiver pendente, salvo orientação da Shopee.
2. Monitorar continuamente o e-mail e telefone cadastrados e responder dentro do prazo indicado; “Cannot contact the developer” é motivo oficial de falha.
3. Manter URL, credenciais e dados demonstrativos estáveis; repetir diariamente um smoke test de login e navegação sem expor a senha.
4. Preservar evidência interna do valor efetivamente enviado em cada campo, sem armazenar senha, token ou PII em Git.
5. Preparar uma resposta curta sobre o UPSeller explicando o ETL XLSX/CSV real, sem chamar de API e sem afirmar que a Shopee reconhece esse método como integração.
6. Preparar, se solicitado, uma conta de demonstração mais completa ou um roteiro que mostre todos os recursos declarados com dados sintéticos.
7. Corrigir desde já as lacunas da DPP; o aceite já produz obrigações, mesmo que o perfil ainda esteja em análise.
8. Se houver rejeição, usar o motivo textual exato e corrigir apenas a causa comprovada; o guia permite nova submissão com informações atualizadas.

## 8. Motivos oficiais de reprovação e exposição atual

| Motivo oficial | Exposição atual do Mavis |
|---|---|
| `Business information incorrect` | Não verificável sem a cópia final do documento e dos campos enviados. |
| `Cannot contact the developer` | Risco operacional; depende do monitoramento e resposta. |
| `Document information incorrect` | Não verificável pós-envio. |
| `Test URL / Test Account cannot be accessed` | Mitigado pelos testes documentados, mas exige estabilidade contínua. |
| `App has not met Third-party Partner Platform Policy` | Risco concentrado na interpretação do UPSeller/ETL e na conta read-only. |
| `Eligibility criteria not met` | Não é possível afirmar atendimento integral enquanto a integração existente não for reconhecida como válida pela Shopee. |
| `Test URL lacks TLS 1.2 and/or DPP compliance` | TLS está bem evidenciado; conformidade DPP integral ainda não está comprovada. |

Fonte da lista: [guia oficial brasileiro, “Principais motivos de falha”](https://open.shopee.com/developer-guide/384).

## Fontes oficiais consultadas

- [Como criar conta na Open Platform e solicitar um perfil de desenvolvedor](https://open.shopee.com/developer-guide/384) — atualizado em 03/07/2026.
- [Requesting Access to Sensitive Data](https://open.shopee.com/developer-guide/718) — atualizado em 13/07/2026.
- [Shopee Open Platform Data Protection Policy](https://open.shopee.com/policy?policy_id=1) — atualizado em 02/07/2025.
- [Shopee Open Platform Platform Partner Rules](https://open.shopee.com/policy?policy_id=2) — atualizado em 09/03/2026.
- [Shopee Open Platform Terms of Service](https://open.shopee.com/agreement) — atualizado em 02/07/2025.
- [Integration Health Rules for Developer](https://open.shopee.com/developer-guide/271) — atualizado em 15/05/2023; usado apenas para registrar a divergência 80% versus 90%.
