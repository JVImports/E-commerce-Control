# AI Agent Handover — SaaS Multi-Tenant & Shopee OAuth

Olá, Agente! Este documento serve como janela de contexto para você continuar a implementação a partir da máquina de casa do usuário.

## 📌 Contexto Geral do Projeto
Este projeto é o **JV Imports Control Tower**, que evoluiu de um painel estático SPA integrado ao Supabase para um modelo **SaaS Multi-Tenant**. 
O sistema agora oferece suporte para que múltiplos operadores se cadastrem/loguem e conectem até **5 lojas da Shopee** individualmente, mantendo isolamento de dados via Postgres RLS e consolidação automática de métricas.

---

## 🛠️ Status da Implementação (Arquivos Locais Atualizados)

1. **Banco de Dados (Supabase DDL):**
   - Tabela `shopee_shops` ativa com limite máximo de 5 registros por usuário controlado via trigger Postgres (`check_user_shop_limit`).
   - RLS ativo em todas as tabelas de dados da Shopee (associado ao `shop_id`) e tabelas de S&OP/Uploads (associados ao `user_id` do operador logado).
   - 28 views reconstruídas com `WITH (security_invoker = true)` para respeitar dinamicamente as políticas de isolamento RLS.

2. **Frontend (Dashboard):**
   - **`index.html`:** Inclui o dropdown do seletor superior de lojas ("Todas as Lojas" ou loja específica) e a seção de gestão de conexões na aba "Integração Shopee" com fluxo OAuth e tokens manuais de fallback.
   - **`styles.css`:** Adicionados estilos estilizados dark/glassmorphic para os cartões de lojas ativas, badges e grids.
   - **`app.js`:** Lógica de login/logout reestruturada, interceptação dos query params `code` e `shop_id` vindos na URL após retorno do OAuth da Shopee (abrindo modal de apelido e salvando no banco), e recálculo dinâmico de todas as métricas consolidadas ou filtradas no seletor.

3. **Backend / Edge Function:**
   - **`index.ts` / `supabase/functions/shopee-sync/index.ts`:** Adicionada ação `auth-shop` para troca de código OAuth por tokens permanentes de API no ambiente de produção da Shopee, e processamento das ações de sincronização com base no contexto específico do `shop_id` passado na requisição.

---

## 🎯 Próximas Etapas

Como a máquina atual possui restrições de execução de shell/terminal (Group Policy), os seguintes passos de publicação precisam ser feitos da sua máquina de casa (ou pelo próprio usuário):

1. **Subir as Alterações para o GitHub (Para atualizar o Netlify):**
   ```bash
   git add .
   git commit -m "feat: implement multi-shop SaaS and Shopee OAuth support"
   git push origin main
   ```
   *Nota: O deploy da interface é automático via integração Netlify-GitHub.*

2. **Fazer o Deploy da Edge Function atualizada no Supabase:**
   Execute o script `deploy_supabase.bat` no terminal ou execute manualmente:
   ```bash
   supabase functions deploy shopee-sync --no-verify-jwt
   ```
   *Nota: O parâmetro `--no-verify-jwt` é obrigatório para permitir o redirecionamento OAuth e validação manual interna do token de usuário.*

3. **Verificar Fluxo:**
   - Validar login/cadastro de novo usuário.
   - Testar o fluxo de conexão OAuth clicando em "Gerar Link de Autorização" na aba "Integração Shopee".
   - Testar o recálculo consolidado ao alternar as lojas conectadas.
