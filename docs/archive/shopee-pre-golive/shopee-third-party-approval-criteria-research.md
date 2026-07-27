# Critérios oficiais para aprovação de Third-party Partner Platform — Shopee Brasil

Pesquisa realizada em 15/07/2026, exclusivamente em fontes oficiais da Shopee. A fonte principal é o guia brasileiro [Como criar conta na Open Platform e solicitar um perfil de desenvolvedor](https://open.shopee.com/developer-guide/384), atualizado pela Shopee em 03/07/2026. As políticas complementares citadas abaixo também são oficiais.

> Escopo: este documento reúne o que deve estar pronto para a aprovação do **perfil de desenvolvedor Third-party Partner Platform**, a criação do app e a posterior solicitação de **Go-Live**. Requisitos de políticas que são contínuos (e não apenas campos do formulário) estão identificados como tal.

## 1. Critérios eliminatórios para o perfil Third-party

- A inscrição deve ser feita como **Third-party Partner Platform**, e não como `Individual` nem, salvo se o software for estritamente interno do próprio vendedor, como `Registered Business Seller`. A Shopee descreve Third-party como empresa licenciada que presta serviços (ERP, hub, integrador ou outro software) a vendedores Shopee. [Fonte oficial](https://open.shopee.com/developer-guide/384)
- A empresa precisa ter **CNPJ registrado** e apresentar documentos empresariais válidos durante a inscrição. [Fonte oficial](https://open.shopee.com/developer-guide/384)
- O produto precisa estar **ativo**, não apenas em desenvolvimento, com integrações de e-commerce existentes que o revisor consiga identificar usando uma conta de teste. [Fonte oficial](https://open.shopee.com/developer-guide/384)
- Devem ser fornecidas URLs ativas do produto e credenciais de uma conta de teste com **todos os recursos habilitados** para a avaliação da Shopee. [Fonte oficial](https://open.shopee.com/developer-guide/384)
- A URL comercial precisa começar por `https://` e usar **TLS 1.2** (a Data Protection Policy exige TLS 1.2 ou superior para comunicações com Protected Data). [Guia brasileiro](https://open.shopee.com/developer-guide/384) · [Data Protection Policy, cláusula 10.5](https://open.shopee.com/policy?policy_id=1)
- O sistema deve poder ser acessado **fora do Brasil** pela URL e credenciais fornecidas. Se o produto for desktop/instalável e não tiver acesso live, deve-se incluir no campo `Remarks` um link para vídeo demonstrando acesso e funcionalidades. [Fonte oficial](https://open.shopee.com/developer-guide/384)
- Os serviços não podem envolver atividades suspeitas, como venda de contas internacionais ou extração de dados de anúncios para viabilizar transações fora da Shopee. [Guia brasileiro](https://open.shopee.com/developer-guide/384) · [Platform Partner Rules](https://open.shopee.com/policy?policy_id=2)
- A solicitação é analisada pelo time regional conforme critérios, diretrizes internas e particularidades locais; portanto, cumprir a checklist pública é necessário, mas a documentação não promete aprovação automática do perfil. [Fonte oficial](https://open.shopee.com/developer-guide/384)

## 2. Dados e documentos do formulário de perfil

O formulário de `Third-party Partner Platform` solicita os seguintes dados obrigatórios: [Fonte oficial](https://open.shopee.com/developer-guide/384)

| Campo | Conteúdo exigido pela Shopee | Evidência a preparar |
|---|---|---|
| Company's Legal Name | Razão social | Igual ao cartão/comprovante do CNPJ |
| Business Registration Number | CNPJ | Digitar sem divergência documental |
| Business Registration Document | Comprovante de Inscrição e de Situação Estadual em JPG/JPEG | Imagem legível, atual e correspondente ao CNPJ/razão social |
| City/Town | Cidade da sede | Igual ao cadastro empresarial |
| Address | Logradouro, número, complemento, bairro e estado | Igual ao documento empresarial |
| Postal Code | CEP da sede | Igual ao cadastro empresarial |
| Country/Area | Brazil | Selecionar Brasil |
| Phone Number | Telefone do desenvolvedor responsável | Contato monitorado durante a análise |
| Registered Contact Email | E-mail principal | Endereço válido e monitorado; todas as comunicações serão enviadas a ele |
| Data Protection Policy | Aceite expresso | Ler e marcar `I agree to the Shopee Open Platform Data Protection Policy` |

Depois, o perfil Third-party solicita: [Fonte oficial](https://open.shopee.com/developer-guide/384)

| Campo | O que declarar |
|---|---|
| What services do your app provide | Serviços e funcionalidades principais, de forma fiel ao que o revisor verá |
| Please provide your app's URL | URL de login do painel ativo, acessível fora do Brasil |
| Test account username | Usuário exclusivo para revisão |
| Test account password | Senha válida do usuário de revisão |
| How many sellers are you supporting currently | Quantidade real de clientes/vendedores atendidos |
| Which other platforms have you integrated with | Canais de e-commerce já integrados e verificáveis no produto |
| Remarks | Instruções que facilitem a análise; para desktop, link obrigatório do vídeo-demo |

Após `Submit`, a Shopee informa que poderá entrar em contato por e-mail para confirmar e coletar informações adicionais. É obrigatório responder **dentro do prazo informado pela Shopee** para que a análise prossiga. [Fonte oficial](https://open.shopee.com/developer-guide/384)

## 3. Conta e experiência do revisor

Requisitos explícitos do guia: [Fonte oficial](https://open.shopee.com/developer-guide/384)

- URL de login live, HTTPS/TLS 1.2, acessível internacionalmente.
- Usuário e senha funcionais.
- Todos os recursos necessários ao teste liberados nessa conta.
- Produto ativo e integrações existentes visíveis/identificáveis.
- Descrição enviada compatível com os serviços realmente oferecidos; ocultar informações comerciais ou oferecer serviço diferente do declarado é infração. [Platform Partner Rules — Accuracy of shared information](https://open.shopee.com/policy?policy_id=2)

Evidências recomendadas para reduzir ambiguidade do revisor (recomendações operacionais derivadas dos requisitos acima, não novos campos oficiais):

1. Criar uma conta dedicada, sem MFA/CAPTCHA dependente de telefone pessoal do solicitante.
2. Colocar dados demonstrativos suficientes para que menus e integrações não pareçam vazios.
3. Preparar um roteiro curto em inglês no `Remarks`: URL → login → menu de integrações → fluxo principal → logout.
4. Testar em janela anônima, rede externa e resolução comum de notebook antes da submissão.
5. Manter suporte disponível no e-mail e telefone cadastrados durante toda a revisão.

## 4. Criação do app e evidências de Go-Live

Depois que o perfil for aprovado, a criação do app exige: `App Type`, `App Name` (nome fantasia simplificado), `App Service Region: Brazil`, descrição da empresa/aplicação/uso e logo em PNG/JPG/JPEG. O **tipo do app determina as APIs e endpoints disponíveis**; a Shopee afirma que não existem liberações manuais/adicionais e orienta criar mais de um app se módulos distintos forem necessários. [Fonte oficial](https://open.shopee.com/developer-guide/384)

Quando o app estiver testado e pronto para Live, o formulário `Go-Live` exige: [Fonte oficial](https://open.shopee.com/developer-guide/384)

- link de login do usuário cliente para a conta de teste da Shopee;
- usuário e senha da conta de teste;
- breve instrução de uso do sistema;
- de **1 a 10 screenshots** da interface do usuário cliente.

O guia informa resposta automática do Go-Live em 24–48 horas e diz que não há liberação manual da Shopee; o status deve ser consultado nos detalhes do app. [Fonte oficial](https://open.shopee.com/developer-guide/384)

### Checklist visual/UI para as screenshots

A documentação pública consultada não impõe um layout, design system ou componentes específicos ao produto. Ela exige que a interface live seja testável e que as screenshots representem a UI do cliente. Para não criar uma exigência inexistente, a aprovação visual deve ser tratada assim:

- screenshots fiéis ao produto enviado, legíveis e sem estados quebrados;
- tela de login, tela principal, integrações/canais e fluxo principal cobertos pelas 1–10 imagens;
- nomenclatura e funcionalidade consistentes com `What services do your app provide` e `App Description`;
- nenhuma alegação visual de afiliação ou homologação que ainda não exista.

Sobre branding: os nomes, marcas e logos da Shopee só podem ser exibidos para promover/anunciar o app com **consentimento prévio por escrito da Shopee**, sob licença limitada e revogável; fora disso, os Termos não concedem direitos sobre as marcas. [Terms of Service, cláusulas 5.2–5.3](https://open.shopee.com/agreement)

## 5. OAuth, credenciais e chamadas de API

- As chaves/credenciais fornecidas pela Shopee são confidenciais; o desenvolvedor deve manter a segurança da conta, chaves e demais credenciais, impedir uso indevido e avisar imediatamente se suspeitar de comprometimento. [Terms of Service, cláusula 2.3](https://open.shopee.com/agreement)
- O guia brasileiro determina que o **link de autorização esteja dentro da interface do sistema**, para que o vendedor consiga iniciar o fluxo; após autenticar-se na Shopee, ele visualiza os acessos solicitados e confirma em `Confirm Authorization`. [Open API auth call — Fluxo autorização](https://open.shopee.com/developer-guide/385)
- O endpoint Live de autorização informado é `https://partner.shopeemobile.com/api/v2/shop/auth_partner` e o Sandbox usa `https://partner.test-stable.shopeemobile.com`; a URL recebe `partner_id`, `timestamp`, `redirect` e `sign`. A assinatura é HMAC-SHA256 de `partner_id + path + timestamp` com `partner_key`, e o timestamp é válido por cinco minutos. [Open API auth call — Fluxo autorização](https://open.shopee.com/developer-guide/385)
- O vendedor dispõe de três minutos para selecionar a região BR e efetuar login. O `code` retornado ao callback é de uso único e válido por dez minutos; deve ser trocado por tokens com `POST /api/v2/auth/token/get`. O access token dura quatro horas; o refresh token é de uso único, dura 30 dias e deve ser renovado por `/api/v2/auth/access_token/get`, persistindo-se sempre o novo refresh token. [Open API auth call — Fluxo autorização](https://open.shopee.com/developer-guide/385)
- A autorização deve ser feita pelo fluxo oficial da Open Platform; a integração não deve obter dados por crawler nem usar APIs internas. Crawling de dados relacionados à Shopee e abuso de Internal API estão expressamente proibidos. [Platform Partner Rules — Illegal or inappropriate behavior](https://open.shopee.com/policy?policy_id=2)
- O tipo do app precisa corresponder aos serviços/APIs necessários, pois ele define os endpoints disponíveis e não há habilitação manual posterior. [Fonte oficial](https://open.shopee.com/developer-guide/384)
- Após criação, o app deve entrar em Live em até **90 dias consecutivos**, fazer ao menos uma chamada API nos 90 dias após o Live e manter taxa média diária de sucesso de pelo menos **90%**. Sucesso significa HTTP 200 com `error` e `message` vazios; APIs públicas, como `v2.public.refresh_access_token`, são excluídas desse cálculo. [Platform Partner Rules — API Performance and Activity](https://open.shopee.com/policy?policy_id=2)

### Evidência técnica sugerida

Sem expor segredos, preparar para eventual auditoria/revisão: diagrama do fluxo OAuth, localização server-side das chaves, URLs de redirect exatas, captura do consentimento/autorização, renovação e revogação de tokens, segregação por loja e tratamento de falhas. Esta é uma recomendação de evidência; as obrigações oficiais de segredo, segurança, least privilege, logs e auditoria estão nas fontes citadas nesta seção e na seguinte.

## 6. Segurança e privacidade — requisitos contínuos

A [Data Protection Policy](https://open.shopee.com/policy?policy_id=1) estabelece requisitos mínimos para qualquer pessoa/empresa que acesse dados pela Open Platform. Os itens mais relevantes para deixar o app auditável são:

- programa escrito de privacidade e segurança, compatível com frameworks reconhecidos, porte/complexidade do negócio e leis aplicáveis; salvaguardas administrativas, técnicas e físicas; designação de responsável sênior por segurança (cláusulas 4.1–4.4);
- controle de acesso granular e menor privilégio; funcionalidades que expõem dados pessoais protegidas por papel exclusivo e acesso por necessidade (4.6);
- logs de acesso/autorização, tentativas de intrusão e mudanças de configuração em APIs, storage e painéis administrativos; proteção contra alteração, sem dados pessoais nos logs, retenção mínima de 90 dias e alertas de atividade suspeita (4.7);
- contas individuais, sem compartilhamento; revisão anual de acessos; revogação em até 24 horas quando o acesso deixa de ser necessário; MFA obrigatório para acesso remoto a redes com Protected Data (5.2–5.7);
- firewall, criptografia padrão de mercado, detecção/prevenção de intrusão, segmentação de rede e retenção de logs de firewall/IDS por pelo menos um ano (5.8);
- documentação de arquitetura, fluxos de dados/processos e segurança; desenvolvimento seguro; ambientes de desenvolvimento/teste separados da produção e **nenhum Protected Data em não-produção** (6.1–6.2);
- scans internos e externos de vulnerabilidade trimestrais e após mudanças materiais; correção de alto risco em até 90 dias; avaliação anual e em major releases das aplicações expostas à internet, incluindo pentest e code review (6.3–6.6);
- patches críticos/emergenciais aplicados assim que possível e nunca além de 30 dias do lançamento (6.7);
- cooperação com declaração de ativos, auditorias, scans e inspeções da Shopee; possibilidade de solicitação de pentest por terceiro aprovado (8.1–8.5);
- função de resposta a incidentes e comunicação de incidente/breach que possa colocar Shopee Content em risco em no máximo **24 horas** para `ssrc@sea.com`, com escopo, datas, dados envolvidos e mitigação (9.1–9.3);
- segregação lógica/física dos dados Shopee dos dados de outros clientes; criptografia em trânsito e de senhas com algoritmo irreversível e salt; TLS 1.2+; retenção de dados pessoais/restritos somente enquanto necessária e, em qualquer caso, por no máximo 90 dias salvo obrigação legal; descarte irrecuperável (10.1–10.7);
- tratamento de dados pessoais apenas para desenvolver, operar e manter o app conforme os Termos/instruções da Shopee; subprocessadores sob contrato pelo menos tão restritivo; transferências internacionais conforme lei e, quando legalmente restritas, com consentimento escrito prévio da Shopee (14.1–14.3).

A [Platform Partner Rules](https://open.shopee.com/policy?policy_id=2) adiciona deveres de avaliações regulares de risco, conscientização da equipe, cooperação com parceiros e correção tempestiva de vulnerabilidades notificadas. Proíbe uso/coleta ilegal, compartilhamento ou vazamento de dados, exposição de informações sensíveis do app, ocultação/exploração de vulnerabilidades e ocultação ou atraso na declaração de ativos.

## 7. Serviços e comportamentos proibidos

Segundo as [Platform Partner Rules](https://open.shopee.com/policy?policy_id=2), o produto e a empresa não podem participar ou estar associados, entre outros, a:

- crawler para coletar dados relacionados à Shopee;
- fraude de fulfillment, como envio intencional de pacote vazio/item alheio;
- serviços para ocultar infrações de sellers, como bloqueadores de IP;
- abuso de APIs internas;
- abuso da Chat Open API (incluindo funções proibidas de atualização proativa de pedidos, broadcasts promocionais, respostas de chatbot ou disfarce de automação como ação manual e vice-versa);
- venda/negociação de contas de sellers ou lojas locais falsas;
- migração unilateral de anúncios para concorrente/site/outra plataforma;
- brushing: pedidos, avaliações, seguidores ou curtidas falsos;
- outras práticas de concorrência desleal.

Se o produto prestar fulfillment a partir de outro varejista ou armazém diretamente ao comprador, aplica-se também a `Third-party Platform Fulfillment Policy` da mesma página. [Fonte oficial](https://open.shopee.com/policy?policy_id=2)

## 8. Motivos oficiais de reprovação e como preveni-los

O guia brasileiro lista estes motivos: [Fonte oficial](https://open.shopee.com/developer-guide/384)

| Motivo exibido pela Shopee | Prevenção antes de reenviar |
|---|---|
| Business information incorrect | Conferir razão social, CNPJ, endereço e CEP contra documento oficial |
| Cannot contact the developer | Monitorar e-mail/telefone e responder no prazo informado |
| Document information incorrect | Enviar JPG/JPEG legível, válido e correspondente aos dados digitados |
| Test URL / Test Account cannot be accessed | Testar URL, região, usuário, senha e permissões em sessão limpa/rede externa |
| App has not met Third-party Partner Platform Policy | Enviar somente produto live, funcional e aderente às regras de parceiros |
| Eligibility criteria not met | Usar tipo Third-party correto; comprovar CNPJ, produto ativo, integrações e conta teste |
| Test URL lacks TLS 1.2 and/or Data Protection Policy compliance | Corrigir HTTPS/TLS e realizar checklist de segurança/privacidade antes do envio |

Em caso de rejeição, o guia permite refazer o processo atualizando as informações; uma nova análise será iniciada. [Fonte oficial](https://open.shopee.com/developer-guide/384)

## 9. Pacote de evidências recomendado para a próxima submissão

Este pacote traduz os critérios oficiais em materiais verificáveis; salvo onde indicado acima, os nomes dos artefatos não são campos obrigatórios da Shopee.

1. Comprovante empresarial JPG/JPEG e uma ficha de conferência CNPJ/razão social/endereço/CEP.
2. URL HTTPS live e resultado de verificação TLS 1.2+.
3. Conta de reviewer exclusiva, com credenciais testadas e todas as funcionalidades relevantes habilitadas.
4. Roteiro em inglês de 5–10 passos mostrando login, serviço principal, integrações existentes e logout.
5. Dados demonstrativos sem dados pessoais reais da Shopee.
6. De 1 a 10 screenshots limpas, correspondentes ao produto live e à descrição do app.
7. Descrição curta e objetiva dos serviços, quantidade real de sellers e integrações reais.
8. Política de privacidade acessível e programa interno mínimo cobrindo papéis, logs, retenção, incidentes, vulnerabilidades e subprocessadores.
9. Diagrama simples de arquitetura/OAuth e inventário de ativos que processam dados Shopee.
10. E-mail e telefone monitorados durante a janela de revisão.

## 10. Matriz final “pronto para submeter”

- [ ] Perfil selecionado como `Third-party Partner Platform`.
- [ ] CNPJ e documento válidos; todos os dados cadastrais coincidem.
- [ ] Produto live, não em desenvolvimento.
- [ ] URL HTTPS com TLS 1.2+ e acessível fora do Brasil.
- [ ] Credenciais de reviewer válidas e permissões completas.
- [ ] Integrações existentes e funcionalidades declaradas são verificáveis.
- [ ] Serviços descritos de forma fiel; quantidade de sellers e canais sem exageros.
- [ ] Nenhum crawler, API interna, migração unilateral, comércio de contas ou função proibida.
- [ ] E-mail e telefone cadastrados são monitorados.
- [ ] Data Protection Policy lida e aceite consciente.
- [ ] Controles mínimos de acesso, logs, retenção, criptografia, incidentes e vulnerabilidades implementados/documentados.
- [ ] App Type planejado conforme APIs/endpoints realmente necessários.
- [ ] Logo próprio em PNG/JPG/JPEG; uso de marca Shopee somente se houver consentimento escrito.
- [ ] 1–10 screenshots e breve guia de uso preparados para o futuro Go-Live.

## Fontes oficiais consultadas

- [Guia brasileiro: criação de conta e solicitação do perfil](https://open.shopee.com/developer-guide/384) — atualizado em 03/07/2026.
- [Guia brasileiro: Open API auth call — Fluxo autorização](https://open.shopee.com/developer-guide/385) — atualizado em 24/07/2024.
- [Shopee Open Platform Platform Partner Rules](https://open.shopee.com/policy?policy_id=2) — atualizado em 09/03/2026.
- [Shopee Open Platform Data Protection Policy](https://open.shopee.com/policy?policy_id=1) — atualizado em 02/07/2025.
- [Shopee Open Platform Terms of Service](https://open.shopee.com/agreement).
