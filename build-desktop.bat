@echo off
rem Builds dist\VisorFinanceiro.exe, a single file that runs the whole app on this PC.
setlocal

cd /d "%~dp0frontend" || goto :failed
if not exist node_modules (
    call npm install || goto :failed
)
call npm run build:desktop || goto :failed

cd /d "%~dp0backend" || goto :failed
set CGO_ENABLED=0
go build -tags desktop -trimpath -ldflags "-s -w" -o "..\dist\VisorFinanceiro.exe" . || goto :failed

echo.
echo Done: %~dp0dist\VisorFinanceiro.exe
exit /b 0

:failed
echo.
echo Build failed.
exit /b 1
