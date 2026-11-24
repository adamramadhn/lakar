@echo off
setlocal
rem Pasang junction dari checkout ini ke repo lakar-meta.
rem Lokasi meta: argumen %1, atau env LAKAR_META, atau file %USERPROFILE%\.lakar-meta.
set "ROOT=%~dp0.."
if not "%~1"=="" (set "META=%~1") else if defined LAKAR_META (set "META=%LAKAR_META%") else if exist "%USERPROFILE%\.lakar-meta" (for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "(Get-Content -LiteralPath '%USERPROFILE%\.lakar-meta' -TotalCount 1).Trim()"`) do set "META=%%a") else (echo Butuh lokasi lakar-meta: scripts\link-meta.cmd ^<path^> atau set LAKAR_META ^& exit /b 1)
if not exist "%META%\_bmad-output" (echo lakar-meta tidak ditemukan di "%META%" ^& exit /b 1)
if not exist "%ROOT%\.claude" mkdir "%ROOT%\.claude"
for %%P in (_bmad-output _bmad .claude\skills design) do (
  if exist "%ROOT%\%%~P" (echo ADA      %%~P) else if exist "%META%\%%~P" (mklink /J "%ROOT%\%%~P" "%META%\%%~P" ^>nul ^&^& echo JUNCTION  %%~P) else (echo LEWATI   %%~P ^(tidak ada di meta^))
)
