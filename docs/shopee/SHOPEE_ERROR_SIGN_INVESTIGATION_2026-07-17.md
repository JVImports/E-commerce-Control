# Investigação oficial — Shopee `error_sign` / `Wrong sign`

Data: 17/07/2026
Escopo: autorização Shopee Open Platform em Sandbox, com foco no endpoint legado `/api/v2/shop/auth_partner`. Fontes documentais primárias da Shopee e respostas dos próprios endpoints foram usadas. Nenhuma chave, assinatura válida ou token foi exibido ou registrado.

## Conclusão executiva

A causa foi isolada por um teste A/B seguro: mantendo exatamente o mesmo Test Partner ID, Test API Partner Key, path, timestamp, `redirect` e HMAC:

| Host Sandbox | Resposta do endpoint da Shopee |
|---|---|
| `https://partner.test-stable.shopeemobile.com` | HTTP 403, `error_sign`, `Wrong sign.` |
| `https://openplatform.sandbox.test-stable.shopee.sg` | HTTP 302 para o fluxo de autorização |

Isso prova que a chave com formato moderno e a assinatura calculada estavam corretas; a variável causal foi somente o host. O host legado rejeitou a mesma assinatura que o host moderno aceitou.

Para o canário atual do Brasil, a correção imediata sustentada pela evidência é usar:

```text
https://openplatform.sandbox.test-stable.shopee.sg/api/v2/shop/auth_partner
```

mantendo a fórmula HMAC legada. Essa troca é de backend/Supabase e **não exige deploy no Netlify**.

Há também uma transição oficial maior: o guia global mais recente da Shopee introduz um novo link `/auth`, sem `sign`, `timestamp` ou Partner Key no link. Porém, o hostname regional BR exibido no guia não resolvia DNS em 17/07/2026. Por isso, não é seguro migrar o canário brasileiro para esse novo `/auth` regional sem confirmação adicional da Shopee.

## Duas gerações de autorização coexistem na documentação oficial

### Guia brasileiro legado — HMAC em `auth_partner`

O guia brasileiro 385, atualizado em 24/07/2024, documenta:

- host de teste `https://partner.test-stable.shopeemobile.com`;
- path `/api/v2/shop/auth_partner`;
- query parameters `partner_id`, `timestamp`, `redirect` e `sign`;
- `sign = HMAC-SHA256(partner_id + path + timestamp, Partner Key)`;
- timestamp Unix em segundos, válido por cinco minutos.

[Guia oficial brasileiro 385](https://open.shopee.com/developer-guide/385) · [conteúdo do guia pela API oficial](https://open.shopee.com/opservice/api/v1/developer_guide/detail?document_id=385&language_code=pt-BR)

### Guia global atual — novo `/auth` sem HMAC no link

O guia oficial 20, atualizado em 13/05/2026, diz expressamente que a plataforma fornece um **novo método** para gerar links de autorização. Nesse método, os parâmetros são:

- `partner_id`;
- `auth_type`, com `seller` para loja/merchant;
- `redirect_uri`;
- `response_type=code`;
- `state` opcional, recomendado contra CSRF.

Não há `sign`, `timestamp` nem Partner Key nessa lista. O guia também exige que o domínio de `redirect_uri` corresponda ao domínio Sandbox Redirect URL configurado no Console, quando este estiver preenchido. [Guia oficial atual 20](https://open.shopee.com/developer-guide/20) · [conteúdo pela API oficial](https://open.shopee.com/opservice/api/v1/developer_guide/detail?document_id=20&language_code=en)

O mesmo guia publica URLs regionais. Para Sandbox Brasil, o texto exibe `https://open.sandbox.test-stable.shopee.com.br/auth`. Contudo, em 17/07/2026 esse hostname e o `href` alternativo embutido no documento não resolveram DNS. O host global `open.sandbox.test-stable.shopee.com` resolvia, mas o próprio guia o classifica como “Global (excluding Mainland China and Brazil)”. Isso caracteriza uma limitação/inconsistência operacional da documentação atual para BR.

## Regra exata da assinatura legada

Para `/api/v2/shop/auth_partner`:

```text
path         = /api/v2/shop/auth_partner
timestamp    = Unix time em segundos, gerado uma única vez
base_string  = String(partner_id) + path + String(timestamp)
sign         = hex(HMAC-SHA256(key = Test API Partner Key,
                               message = base_string))
```

O exemplo oficial usa `CryptoJS.HmacSHA256(...).toString(CryptoJS.enc.Hex)`. [Guia oficial 385](https://open.shopee.com/developer-guide/385) · [API documental oficial](https://open.shopee.com/opservice/api/v1/developer_guide/detail?document_id=385&language_code=pt-BR)

Consequências da fórmula:

- o host não entra na mensagem;
- `redirect` não entra na mensagem;
- não entram `?`, query string, nomes de parâmetros ou separadores;
- não existe barra final depois de `auth_partner`;
- o timestamp da mensagem e da query deve ser idêntico;
- o digest é hexadecimal, não Base64;
- SHA-256 simples não substitui HMAC-SHA256.

Como o host não faz parte da mensagem, foi possível usar exatamente a mesma assinatura no teste A/B. A aceitação no host moderno confirma a correção desses insumos.

## Formato da Test API Partner Key

O guia 385 manda usar como chave HMAC a Partner Key encontrada nos detalhes do App e diferencia Test Key de Live Key. Não orienta decodificar hexadecimal, converter para Base64, remover prefixos ou adicionar aspas. [Guia oficial 385](https://open.shopee.com/developer-guide/385) · [Console oficial de Apps — requer login](https://open.shopee.com/myconsole/management/app)

O Developer Guide oficial de teste confirma que o App List entrega um par próprio de `partner_id` e `key` para Sandbox; credenciais de Live, de outro App ou de outro Partner ID não devem ser misturadas. Ele também orienta criar e usar uma loja de teste no consentimento, deixando credenciais Live para depois do Go Live. [Developer Guide oficial Shopee/Garena](https://cdngarenanow-a.akamaihd.net/shopee/seller/seller_cms/b17e7e1846b98c422e4404f223b9f65f/%5BTW%5D%5BOpen%20API%5DAPI%E4%B8%B2%E6%8E%A5%E8%AA%AA%E6%98%8E%E4%BA%8B%E9%A0%85%20%282020_10_21%29_newnew.pdf)

A credencial atual verificada operacionalmente usa o prefixo moderno `shpk`; somente esse metadado de formato foi observado. O valor não foi lido por esta pesquisa nem registrado. O teste aceito pelo host moderno comprova que o prefixo faz parte da chave textual e **não deve ser removido**.

BOM, CR/LF, espaços nas bordas ou aspas introduzidos por clipboard, arquivo ou secret manager alteram os bytes do segredo e, por consequência, o HMAC. Essa é uma consequência criptográfica; não é uma transformação recomendada pela Shopee.

## Timestamp e redirect no fluxo legado

- O timestamp é `uint32`/Unix time em segundos e vale cinco minutos.
- O mesmo valor deve ser usado na assinatura e na URL.
- `redirect` é enviado como query parameter, mas não é assinado.
- Após o consentimento, a Shopee acrescenta `code` e `shop_id` ao retorno; o code é de uso único e vale dez minutos. [Guia oficial 385](https://open.shopee.com/developer-guide/385) · [API documental oficial](https://open.shopee.com/opservice/api/v1/developer_guide/detail?document_id=385&language_code=pt-BR)

No novo fluxo do guia 20, o nome passa a ser `redirect_uri`, o domínio deve respeitar a configuração do App e `state` é devolvido sem alteração para validação CSRF. [Guia oficial 20](https://open.shopee.com/developer-guide/20) · [API documental oficial](https://open.shopee.com/opservice/api/v1/developer_guide/detail?document_id=20&language_code=en)

## O que `Wrong sign` significa

O guia 385 define `Wrong sign.` como assinatura gerada incorretamente e cita path incorreto como causa usual nas chamadas de token. Ele distingue esse erro de `Invalid partner id` e `Invalid timestamp`. Não há no guia uma tabela separada para erros de `auth_partner`. [Guia oficial 385](https://open.shopee.com/developer-guide/385) · [API documental oficial](https://open.shopee.com/opservice/api/v1/developer_guide/detail?document_id=385&language_code=pt-BR)

Neste incidente, porém, `Wrong sign` no host legado não significava que o HMAC local estava errado: a mesma assinatura foi aceita pelo endpoint moderno da própria Shopee. Isso demonstra que a mensagem de erro também pode mascarar incompatibilidade de rota/infraestrutura com o formato moderno de credencial.

## Evidência experimental sem segredo

O teste controlado utilizou:

- o mesmo Partner ID de teste;
- a mesma chave, sem registrar seu valor;
- o mesmo path `/api/v2/shop/auth_partner`;
- um único timestamp em segundos;
- a mesma assinatura hexadecimal;
- o mesmo redirect;
- mudança apenas do host.

Resultado:

- [endpoint Sandbox legado da Shopee](https://partner.test-stable.shopeemobile.com/api/v2/shop/auth_partner): rejeição `403 error_sign`;
- [endpoint Sandbox moderno da Shopee](https://openplatform.sandbox.test-stable.shopee.sg/api/v2/shop/auth_partner): `302`, avanço ao fluxo de autorização.

Também foi observado que os dois hostnames apontavam para a infraestrutura SGW da Shopee. Mesmo assim, o comportamento lógico por Host diferiu, reforçando que são rotas/configurações distintas no gateway.

## Recomendação para o app

### Agora, para concluir o canário

1. Trocar somente o base host Sandbox do backend para `https://openplatform.sandbox.test-stable.shopee.sg`.
2. Preservar integralmente a chave `shpk...`; não remover prefixo nem hex-decodificar.
3. Manter `partner_id + /api/v2/shop/auth_partner + timestamp` e HMAC-SHA256 hexadecimal.
4. Confirmar `302` pela Edge Function antes de pedir novo clique ao usuário.
5. Não publicar frontend no Netlify; a URL é gerada no backend.

### Depois do canário

1. Abrir chamado à Shopee informando o request ID do host legado e o A/B 403 versus 302, sem enviar a Partner Key.
2. Pedir confirmação do endpoint oficial atual para Sandbox Brasil e da disponibilidade do novo `/auth` regional.
3. Planejar migração ao novo fluxo `/auth` somente depois de confirmar o hostname BR e configurar o Test Redirect URL Domain no Console.

O material oficial de suporte recomenda informar descrição, ambiente, API, request/response, horário e request ID. [PDF oficial Shopee — OpenAPI Authorization & Authentication](https://cdngarenanow-a.akamaihd.net/shopee/seller/seller_cms/c575929f948611337e1249564c2b8ff6/%5BTW%5D%5BOpen%20API%5DAPI%20v1_v2%E6%8E%88%E6%AC%8A%E6%96%B9%E6%B3%95%20%282020_09%29_newnew.pdf)

## Limitações e inconsistências das fontes

- Os detalhes privados do App e a Test Key exigem login no Console; esta pesquisa não acessou nem registrou o valor da chave.
- O guia brasileiro 385 está desatualizado em relação à infraestrutura que aceitou chaves modernas `shpk` no teste de 17/07/2026.
- O guia global 20 é mais recente e introduz `/auth`, mas o hostname BR exibido não resolvia DNS durante a investigação.
- O exemplo de código do guia 385 contém defeitos editoriais; a fórmula textual, porém, é clara.
- Um PDF oficial de 2020 cita ainda outro host (`partner.uat.shopeemobile.com`) e contém uma linha contraditória sobre SHA-256 simples. Ele serve apenas como referência histórica e de suporte; não deve prevalecer sobre os guias atuais.
- Não foi localizado SDK oficial mantido pela Shopee para servir como implementação de referência.
