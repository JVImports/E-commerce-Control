# Mavix Hub — E-commerce Control

Painel operacional multiempresa para integração com marketplaces, estoque, finanças e anúncios.

## Estrutura principal

- Frontend estático: arquivos HTML, CSS e JavaScript na raiz.
- Backend: migrations e Edge Functions em `supabase/`.
- Testes de contrato: `tests/`.
- Build e validação: `scripts/`.
- Documentação organizada: [`docs/README.md`](docs/README.md).
- Evidências privadas locais: `evidence-private/` — ignoradas pelo Git.

## Estado atual

O app Shopee foi enviado para revisão de Go-Live em 18/07/2026. O checkpoint operacional está em `docs/checkpoints/CHECKPOINT_GOLIVE_SHOPEE_2026-07-18.md`.

## Continuar em outro computador

Instale o Git e autentique-se no GitHub com uma conta que tenha acesso ao repositório privado. Para baixar o projeto e continuar na branch atual:

```powershell
git clone https://github.com/JVImports/E-commerce-Control.git
cd E-commerce-Control
git switch agent/organize-project-workspace
```

Se o repositório já estiver clonado no outro computador:

```powershell
cd E-commerce-Control
git fetch origin
git switch agent/organize-project-workspace
git pull
```

Depois que o PR desta branch for integrado à `main`, use:

```powershell
git switch main
git pull origin main
```

O GitHub não transfere `.env.local`, o conteúdo de `evidence-private/`, `.netlify/` nem `supabase/.temp/`. Esses arquivos contêm credenciais, evidências ou configurações locais e devem ser recriados ou transferidos separadamente por um meio privado.

## Build local

O build exige as variáveis públicas `MAVIS_SUPABASE_URL` e `MAVIS_SUPABASE_PUBLISHABLE_KEY`:

```powershell
node scripts/build.mjs
node scripts/validate-release.mjs
```

O diretório `dist/` é gerado, validado e não deve ser versionado.

## Segurança

- Nunca versionar `.env.local` ou o conteúdo de `evidence-private/`.
- Nunca registrar chaves Shopee, tokens OAuth ou chaves privilegiadas do Supabase em documentos ou commits.
- O código arquivado em `docs/archive/` serve apenas como histórico e não representa o fluxo operacional vigente.
