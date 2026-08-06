@echo off
chcp 65001 >nul
title Optigo Print Agent
cd /d "%~dp0"

echo.
echo  ========================================
echo    Optigo Print Agent - In tem kinh
echo  ========================================
echo.
echo  Dang khoi dong... De cua so nay MO khi in tem.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0print-agent.ps1"
if errorlevel 1 (
  echo.
  echo  Agent dung do loi. Xem thong bao phia tren.
  pause
)
