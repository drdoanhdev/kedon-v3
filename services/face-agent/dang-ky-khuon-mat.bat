@echo off
chcp 65001 >nul
title Optigo Face Agent - Dang ky khuon mat
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Chua cai dat. Hay chay cai-dat.bat truoc.
  pause
  exit /b 1
)

echo.
echo Dang ky khuon mat benh nhan (nhin thang camera 2-3 giay)
echo.

set /p PATIENT_ID="Nhap ID benh nhan: "
if "%PATIENT_ID%"=="" (
  echo ID khong hop le.
  pause
  exit /b 1
)

echo.
".venv\Scripts\python.exe" main.py enroll --patient-id %PATIENT_ID%
echo.
pause
