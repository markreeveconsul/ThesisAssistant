@echo off
setlocal
title Thesa - Local Server
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-thesa.ps1" %*
set "thesa_exit=%errorlevel%"
if not "%thesa_exit%"=="0" if "%~1"=="" pause
exit /b %thesa_exit%
