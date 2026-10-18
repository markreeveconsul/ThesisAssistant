@echo off
setlocal
title Thesa - AI Connection Check
pushd "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
    echo Install backend dependencies first. See docs\SOURCE_UPLOADS.md.
) else (
    ".venv\Scripts\python.exe" -m document_service.check_ai
)
popd
pause
