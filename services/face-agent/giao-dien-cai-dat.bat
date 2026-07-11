@echo off
cd /d "%~dp0"
call "%~dp0_ensure_console.bat" "Optigo Face Agent - Giao dien cai dat" "%~f0" %*
if errorlevel 1 exit /b 0

chcp 65001 >nul
title Optigo Face Agent - Giao dien cai dat

if not exist ".venv\Scripts\python.exe" (
  echo Chua cai dat. Hay chay cai-dat.bat truoc.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   MO GIAO DIEN CAI DAT (trinh duyet)
echo ============================================
echo Se tu mo trinh duyet tai http://127.0.0.1:8767
echo Ghep noi + do camera ngay tren giao dien, khong can go lenh.
echo.

".venv\Scripts\python.exe" main.py setup-ui
echo.
pause
