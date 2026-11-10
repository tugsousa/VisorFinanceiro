@echo off
rem Sets up VisorFinanceiro on this PC: installs Go and Node.js if needed, builds the app and adds it
rem to Claude Desktop. Takes the parameters of setup.ps1, e.g. setup.bat -SkipClaude
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
set RESULT=%ERRORLEVEL%
echo.
pause
exit /b %RESULT%
