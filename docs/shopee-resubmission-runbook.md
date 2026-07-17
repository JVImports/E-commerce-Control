# Reenvio do perfil Third-party — Shopee

## Jornada do revisor

Usar, após a publicação final, `https://ecommerce-control-jv.netlify.app/?review=shopee`. A URL deve abrir o login e, com a conta de teste, levar diretamente a **Integrações**. O revisor deve ver o canal Shopee em acompanhamento e o UPSeller ETL ativo, com contagens e atualização recente. A conta é somente leitura e não exige instalação, dados do Supabase nem outro login.

Antes do envio, repetir o teste em sessão anônima e rede externa. Não usar o subdomínio `mavis-review--...` no formulário: ele é apenas um preview de validação.

## Correções obrigatórias do formulário

- Selecionar **Third-party Partner Platform**.
- Copiar razão social, CNPJ, município, CEP e endereço exatamente do comprovante oficial. No endereço, incluir logradouro, número, complemento, bairro e estado.
- Remover **TikTok**. Declarar somente uma plataforma que o revisor consiga verificar no produto.
- Para UPSeller, escrever **controlled XLSX/CSV ETL integration**; não afirmar integração por API.
- Selecionar somente serviços demonstráveis. Para esta submissão: gestão de produtos/listagens, estoque e análise de dados. Não selecionar Chat nem acesso a PII não mascarada.
- Informar a quantidade real de sellers atendidos; não usar faixa inflada.
- Anexar documento empresarial atual, legível e no formato JPG/JPEG solicitado.
- Não declarar relatório de pentest se ele não existe e não anexar arquivo fictício.

## Texto sugerido para Remarks

> Mavix Hub is a live multi-tenant operations hub for marketplace sellers, operated by JV IMPORTS LTDA. Sign in with the dedicated test account; the system opens the Integrations page automatically. The reviewer can verify the Shopee integration workflow and the active UPSeller controlled XLSX/CSV ETL, including modules, record counts and recent update timestamps. The account is read-only, requires no installation or additional login, and contains no real customer personal data. We do not request access to unmasked PII.

## Evidências

- Comprovante empresarial atual em JPG/JPEG.
- Tela de login, página Integrações e módulos UPSeller com informações pessoais ocultadas.
- Vídeo curto: abrir URL → login → Integrações → contagens/atualização → logout. Nunca mostrar a senha.
- Resultado HTTPS/TLS 1.2 e cabeçalhos de segurança.
- Política de Privacidade pública.
- E-mail e telefone cadastrados monitorados durante a análise.

## Segurança das credenciais

A senha antiga apareceu nos PDFs da reprovação e deve ser considerada comprometida. Antes do reenvio, alterar a senha da conta de avaliação e revogar sessões antigas. Não salvar a nova senha no Git, documentação, prints, vídeo ou conversa; o titular deve digitá-la diretamente no formulário.
