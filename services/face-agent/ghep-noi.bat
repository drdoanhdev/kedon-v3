@echo off
chcp 65001 >nul
title Optigo Face Agent - Ghep noi
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Chua cai dat. Hay chay cai-dat.bat truoc.
  pause
  exit /b 1
)

set "API_URL=https://app.optigo.vn"
if exist "config.json" (
  for /f "usebackq tokens=1,* delims=: " %%a in (`findstr /c:"api_base_url" config.json`) do (
    set "LINE=%%b"
  )
)

echo.
echo ============================================
echo   Ghep noi thiet bi voi Optigo
echo ============================================
echo.
echo Lay ma 8 ky tu tu: Quan ly phong kham - Nhan dien khuon mat
echo.

set /p PAIR_CODE="Nhap ma ghep noi: "
if "%PAIR_CODE%"=="" (
  echo Ma khong hop le.
  pause
  exit /b 1
)

set /p API_URL_IN="URL Optigo [%API_URL%]: "
if not "%API_URL_IN%"=="" set "API_URL=%API_URL_IN%"

echo.
".venv\Scripts\python.exe" main.py pair --code %PAIR_CODE% --api-url %API_URL%
echo.
pause
