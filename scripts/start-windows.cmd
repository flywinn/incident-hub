@echo off
setlocal
cd /d "%~dp0\.."
if not exist logs mkdir logs
call npm.cmd start >> logs\application.log 2>&1
