@echo off
setlocal
echo ===================================================
echo     DEPLOY DA EDGE FUNCTION (SHOPEE SYNC)
echo ===================================================
echo.
echo Como voce nao tem o Node.js (npx) instalado nesta maquina,
echo vamos baixar o Supabase CLI oficial automaticamente...
echo.

:: Cria estrutura de pastas do Supabase
IF NOT EXIST "supabase\functions\shopee-sync" (
    mkdir "supabase\functions\shopee-sync"
    echo [OK] Estrutura de pastas da funcao criada.
)
copy /Y index.ts "supabase\functions\shopee-sync\index.ts" >nul
echo [OK] Arquivo index.ts copiado.

:: Baixa o Supabase CLI se nao existir
IF NOT EXIST "supabase.exe" (
    echo.
    echo Baixando o Supabase CLI... (isso pode levar alguns segundos)
    curl -L -o supabase.tar.gz https://github.com/supabase/cli/releases/latest/download/supabase_windows_amd64.tar.gz
    
    echo Extraindo arquivo...
    tar -xzf supabase.tar.gz
    
    del supabase.tar.gz
    echo [OK] Supabase CLI baixado com sucesso!
)

echo.
echo ===================================================
echo Passo 1: Autenticacao no Supabase
echo ===================================================
echo Para contornar o bloqueio de rede, vamos usar o Token diretamente.
echo Gere um Token aqui (copie-o): https://supabase.com/dashboard/account/tokens
echo.
set /p SUPABASE_ACCESS_TOKEN=Cole o seu Access Token aqui e aperte ENTER: 

echo.
echo ===================================================
echo Passo 2: Vincular ao seu Projeto
echo ===================================================
echo O ID do seu projeto eh: qzcxukcwvjnhbnwpjceg
echo (Sera solicitada a senha do seu banco de dados Supabase)
supabase.exe link --project-ref qzcxukcwvjnhbnwpjceg

echo.
echo ===================================================
echo Passo 3: Fazendo o Deploy da Funcao
echo ===================================================
supabase.exe functions deploy shopee-sync --no-verify-jwt

echo.
echo ===================================================
echo Deploy concluido! Aperte qualquer tecla para sair.
echo ===================================================
pause
