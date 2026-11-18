
@echo off
cd /d "%~dp0"
py python\app.py
if errorlevel 1 python python\app.py
pause

