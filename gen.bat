@echo off
REM Supabase Personal Access Token NIEKADA neirasomas i si faila - jis guli
REM git'e. Zetonas paimamas is aplinkos kintamojo:
REM     setx SUPABASE_ACCESS_TOKEN sbp_xxxxx
if "%SUPABASE_ACCESS_TOKEN%"=="" (
  echo Nustatykite SUPABASE_ACCESS_TOKEN aplinkos kintamaji ir paleiskite is naujo.
  exit /b 1
)
npx supabase gen types typescript --project-id zfntcsdijgclolanwlpp > src\types\database.types.ts
