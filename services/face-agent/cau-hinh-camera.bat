@echo off
cd /d "%~dp0"
call "%~dp0_ensure_console.bat" "Optigo Face Agent - Cau hinh camera" "%~f0" %*
if errorlevel 1 exit /b 0

chcp 65001 >nul
title Optigo Face Agent - Cau hinh camera

if not exist ".venv\Scripts\python.exe" (
  echo Chua cai dat. Hay chay cai-dat.bat truoc.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Cau hinh camera (USB hoac IP / RTSP)
echo ============================================
echo.
echo Khong can sua file config.json thu cong.
echo Chi can tra loi cac cau hoi ben duoi.
echo.
echo Sau khi doi camera: chay lai chay-agent.bat
echo.

".venv\Scripts\python.exe" main.py config-camera
echo.
pause
