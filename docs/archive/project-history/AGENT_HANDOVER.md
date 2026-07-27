# AI Agent Handover — JV Imports Control Tower

> **Última atualização:** 22/06/2026 — Sessão de implementação SaaS Multi-Tenant & Shopee OAuth

Olá, Agente! Este documento é a janela de contexto completa para você continuar a implementação a partir de qualquer máquina.

---

## 📌 Contexto Geral do Projeto

**Produto:** JV Imports Control Tower — Painel SaaS de gestão para e-commerce Shopee.

**Stack:**
- **Frontend:** HTML + Vanilla CSS + JS (SPA) hospedado no **Netlify**
- **Backend/Banco:** **Supabase** (Postgres + RLS + Edge Functions em TypeScript)
- **Repositório:** `JVImports/E-commerce-Control` no **GitHub**
- **Deploy:** Netlify conectado ao GitHub (auto-deploy no push para `main`)

**Modelo de Negócio:** SaaS Multi-Tenant — cada usuário faz login via Supabase Auth, conecta até 5 lojas da Shopee e vê seus dados em isolamento via RLS.

---

## 🛠️ O Que Já Foi Implementado (100% Concluído)

### Banco de Dados (Supabase)
- ✅ Tabela `shopee_shops` com trigger `check_user_shop_limit` — limite de 5 lojas por usuário
- ✅ RLS ativo em todas as tabelas de dados Shopee (`shop_id` vinculado ao usuário)
- ✅ 28 views reconstruídas com `WITH (security_invoker = true)` para respeitar RLS
- ✅ Políticas de acesso: usuário só vê dados das próprias lojas
- ✅ `shopee_shops` armazena: `user_id`, `shop_id`, `shop_name`, `access_token`, `refresh_token`, `token_expire_in`

### Frontend (Dashboard)
- ✅ **Login/Cadastro:** Tela de auth com Supabase Auth (email/senha), toggle entre login e signup
- ✅ **Seletor de Loja:** Dropdown no header — "Todas as Lojas (Consolidado)" ou loja específica
- ✅ **Gestão de Lojas:** Aba "Integração Shopee" com listagem das lojas conectadas, botões Ativar/Desvincular
- ✅ **Conectar Nova Loja:** Formulário com OAuth (código de autorização) ou tokens manuais (fallback)
- ✅ **OAuth Redirect Handler:** Intercepta `?code=...&shop_id=...` na URL após retorno da Shopee
- ✅ **Métricas Consolidadas:** Quando "Todas as Lojas" selecionado, agrega dados de todas as lojas do usuário
- ✅ **Filtro por Loja:** Todos os fetches do Supabase filtram por `shop_id` quando uma loja específica está ativa

### Backend / Edge Function (`supabase/functions/shopee-sync/index.ts`)
- ✅ Ação `auth-shop`: Troca código OAuth por tokens permanentes e salva em `shopee_shops`
- ✅ Ação `GET /`: Retorna lista de lojas do usuário + URL de autorização OAuth da Shopee
- ✅ Todas as ações de sync respeitam o `shop_id` passado no body da requisição
- ✅ `AsyncLocalStorage` com `shopContext` para injetar `shop_id` e `user_id` nas funções utilitárias

---

## 🎯 Próximos Passos — Checklist do Agente

### PASSO 1 — Deploy da Edge Function no Supabase ⚡ (OBRIGATÓRIO)
A Edge Function foi atualizada localmente mas ainda precisa ser publicada no Supabase.

**Opção A — Script automático (recomendado):**
Execute o arquivo `deploy_supabase.bat` na raiz do projeto.

**Opção B — Terminal manual:**
```bash
# Navegar para o diretório do projeto
cd "c:\Users\joao.tamanqueira\Documents\Projeto Controle JV"

# Deploy da função atualizada
supabase functions deploy shopee-sync --no-verify-jwt
```

> ⚠️ O parâmetro `--no-verify-jwt` é **obrigatório**. Ele permite que o redirect OAuth funcione e que a validação do token Supabase seja feita internamente pela função.

---

### PASSO 2 — Configurar Variáveis de Ambiente no Supabase 🔑
As credenciais da API Shopee precisam estar nas secrets da Edge Function.

No painel do Supabase → **Edge Functions → shopee-sync → Secrets**, verifique/adicione:
```
SHOPEE_PARTNER_ID=<ID do parceiro Shopee>
SHOPEE_PARTNER_KEY=<Chave do parceiro Shopee>
SHOPEE_REDIRECT_URL=<URL do site no Netlify>
```

> 💡 A `SHOPEE_REDIRECT_URL` deve ser a URL pública do site no Netlify (ex: `https://jv-imports-control.netlify.app`) para que o OAuth redirecione corretamente após autorização.

---

### PASSO 3 — Testar o Fluxo Completo ✅
1. Abrir o site no Netlify
2. **Fazer login** com e-mail e senha (ou criar nova conta)
3. Ir até **"Integração Shopee"** na sidebar
4. Salvar a **URL da Edge Function** (formato: `https://xxxx.supabase.co/functions/v1/shopee-sync`)
5. Clicar em **"Gerar Link de Autorização"** → deve abrir a página de login da Shopee
6. Autorizar o app → a URL de retorno deve ter `?code=...&shop_id=...`
7. Colar o código no campo ou deixar o sistema interceptar automaticamente o redirect
8. A loja deve aparecer na lista com nome configurado
9. Testar o **seletor de lojas** no header — alternar entre lojas e verificar se os dados filtram
10. Testar **sincronização manual** de módulos (Produtos, Pedidos, Escrow, etc.)

---

### PASSO 4 — Melhorias Pendentes (Backlog Técnico) 📋

#### 4.1 Refresh Automático de Tokens Shopee
Os tokens de acesso da Shopee expiram em ~4 horas. A Edge Function precisa de uma rotina de refresh automático.

- **Onde implementar:** Em `index.ts`, antes de qualquer chamada à API Shopee, verificar `token_expire_in` da loja.
- **Lógica:** Se expirado ou vai expirar em < 30 minutos, chamar o endpoint `/auth/access_token/get` da Shopee com o `refresh_token` e atualizar `shopee_shops`.
- **Referência API Shopee:** `POST /api/v2/auth/access_token/get`

#### 4.2 Cron Job de Sincronização Automática
Atualmente a sincronização é manual (botão na tela). Implementar sync automático via Supabase Cron ou pg_cron.

- **Sugestão:** Usar `pg_cron` no Supabase para disparar a Edge Function a cada hora:
```sql
SELECT cron.schedule('sync-shopee-hourly', '0 * * * *', $$
  SELECT net.http_post(
    url := 'https://xxxx.supabase.co/functions/v1/shopee-sync',
    body := '{"action":"sync-all"}',
    headers := '{"Authorization":"Bearer SERVICE_ROLE_KEY"}'
  );
$$);
```

#### 4.3 Notificações de Ruptura de Estoque
Implementar alerta por e-mail quando SKU atingir cobertura < 7 dias.
- **Ferramenta:** Supabase Edge Function + Resend (API de e-mail) ou SMTP próprio.

#### 4.4 Dashboard Multi-Loja Aprimorado
- Gráfico comparativo entre lojas (barras lado a lado por loja)
- Ranking de lojas por faturamento, ROAS e lucro

#### 4.5 Configurações de Usuário por Loja
- Permitir que o usuário configure taxas de marketplace individualmente por loja (ex: taxa diferente para cada conta)
- Tabela sugerida: `user_shop_settings(user_id, shop_id, commission_override, service_fee_override)`

---

## 🏗️ Arquitetura do Sistema (Referência Rápida)

```
Netlify (Frontend SPA)
  └── index.html + app.js + styles.css
       ├── Supabase JS Client (auth + realtime DB)
       └── Calls Edge Function para ações Shopee

Supabase
  ├── Auth (usuários/sessões)
  ├── PostgreSQL
  │    ├── shopee_shops       ← tokens por loja/usuário
  │    ├── shopee_products    ← catálogo sincronizado
  │    ├── shopee_orders      ← pedidos
  │    ├── shopee_escrow      ← financeiro
  │    ├── shopee_ads_daily   ← performance de ads
  │    ├── upseller_stock_*   ← estoque ETL
  │    └── 28+ views SQL      ← métricas consolidadas
  └── Edge Function: shopee-sync/index.ts
       ├── GET  → lista lojas + URL OAuth
       ├── POST action=auth-shop    → troca código → tokens
       ├── POST action=sync-products
       ├── POST action=sync-orders-step
       ├── POST action=sync-escrow-step
       ├── POST action=sync-wallet-step
       ├── POST action=sync-ads-daily-step
       └── POST action=sync-returns-step
```

---

## ⚠️ Restrições da Máquina Atual (Escritório)

- ❌ Comandos PowerShell bloqueados por Group Policy
- ❌ Não é possível executar `git`, `supabase CLI`, `node`, `npm` via terminal
- ✅ Acesso aos MCPs: `github-mcp-server`, `supabase` (MCP), `netlify` (MCP)
- ✅ Modificações de código funcionam normalmente via agente
- ✅ Deploy via GitHub MCP + auto-deploy Netlify funciona

---

## 🔗 Links Úteis

- **Repositório GitHub:** `https://github.com/JVImports/E-commerce-Control`
- **Supabase Dashboard:** Acessar via console do Supabase com as credenciais do projeto
- **Netlify:** Dashboard do site para verificar deploys automáticos
- **Shopee Open Platform:** `https://open.shopee.com` (para Partner ID, Key e configuração do redirect URL)
