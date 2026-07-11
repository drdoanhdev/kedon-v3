@echo off
cd /d "%~dp0"
call "%~dp0_ensure_console.bat" "Optigo Face Agent - Cai dat nhanh" "%~f0" %*
if errorlevel 1 exit /b 0

chcp 65001 >nul
title Optigo Face Agent - Cai dat nhanh

echo.
echo ============================================
echo   OPTIGO FACE AGENT - CAI DAT NHANH
echo ============================================
echo.
echo Buoc nay se tu dong:
echo   1. Cai dat thu vien (neu chua cai)
echo   2. Ghep noi voi Optigo (can ma tu web)
echo   3. Do camera trong mang LAN va cau hinh
echo   4. Kiem tra camera va bat nhan dien
echo.

if not exist ".venv\Scripts\python.exe" (
  echo Chua cai dat thu vien — dang chay cai-dat.bat truoc...
  echo.
  call "%~dp0cai-dat.bat" --run
  if not exist ".venv\Scripts\python.exe" (
    echo.
    echo [LOI] Cai dat that bai. Xem huong dan o tren.
    pause
    exit /b 1
  )
)

".venv\Scripts\python.exe" main.py setup
echo.
pause
