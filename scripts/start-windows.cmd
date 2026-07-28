@echo off
setlocal
cd /d "%~dp0\.."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-server.ps1" -ProjectPath "%CD%"
exit /b %ERRORLEVEL%
