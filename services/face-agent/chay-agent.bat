@echo off
chcp 65001 >nul
title Optigo Face Agent - Nhan dien
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Chua cai dat. Hay chay cai-dat.bat truoc.
  pause
  exit /b 1
)

echo Dang chay nhan dien khuon mat...
echo Nhan Ctrl+C de dung.
echo.

".venv\Scripts\python.exe" main.py run
if %errorlevel% neq 0 pause
