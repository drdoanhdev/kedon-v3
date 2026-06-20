@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Optigo Face Agent - Cai dat
cd /d "%~dp0"

echo.
echo ============================================
echo   Optigo Face Agent - Cai dat tu dong
echo ============================================
echo.

call "%~dp0_env.bat"
if %errorlevel%==0 if exist "%VENV_PY%" (
  echo Da cai dat san. Chay lai de cap nhat thu vien.
  goto :install_deps
)

if not defined PYTHON (
  echo Chua tim thay Python 3.10+ tren may.
  echo.
  echo Dang thu cai Python qua winget...
  where winget >nul 2>&1
  if !errorlevel!==0 (
    winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 goto :no_python
    echo Cho he thong cap nhat PATH...
    timeout /t 5 /nobreak >nul
    set "PYTHON="
    set "PIP="
    call "%~dp0_env.bat"
  )
)

:no_python
if not defined PYTHON (
  echo.
  echo [LOI] Khong tim thay Python.
  echo.
  echo Vui long cai Python 3.10 tro len:
  echo   https://www.python.org/downloads/
  echo.
  echo Khi cai, danh dau "Add python.exe to PATH".
  echo Sau do chay lai file cai-dat.bat
  echo.
  pause
  exit /b 1
)

echo Tim thay Python: %PYTHON%

"%PYTHON%" -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" 2>nul
if %errorlevel% neq 0 (
  echo [LOI] Can Python 3.10 tro len. Phien ban hien tai qua cu.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo Tao moi truong ao (.venv)...
  "%PYTHON%" -m venv .venv
  if %errorlevel% neq 0 (
    echo [LOI] Khong tao duoc .venv
    pause
    exit /b 1
  )
)

:install_deps
set "PYTHON=%VENV_PY%"
set "PIP=%VENV_PIP%"

echo.
echo Cai dat thu vien (lan dau co the mat 5-15 phut)...
"%PYTHON%" -m pip install --upgrade pip
"%PIP%" install -r requirements.txt
if %errorlevel% neq 0 (
  echo.
  echo [LOI] Cai dat that bai. Kiem tra ket noi mang va chay lai.
  pause
  exit /b 1
)

if not exist "config.json" (
  echo Tao file cau hinh mac dinh...
  copy /Y "config.example.json" "config.json" >nul
)

echo.
echo Tai model nhan dien (lan dau ~300MB, can mang)...
"%PYTHON%" -c "from insightface.app import FaceAnalysis; a=FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); a.prepare(ctx_id=0, det_size=(640,640)); print('Model OK')"
if %errorlevel% neq 0 (
  echo.
  echo [CANH BAO] Chua tai duoc model. Kiem tra mang va chay lai cai-dat.bat
  echo Agent van co the chay sau khi model tai xong.
) else (
  echo Model da san sang.
)

echo.
echo ============================================
echo   Cai dat hoan tat!
echo ============================================
echo.
echo Buoc tiep theo:
echo   1. Chay "ghep-noi.bat" - nhap ma tu web Optigo
echo   2. Chay "chay-agent.bat" - bat nhan dien tu dong
echo.
echo Xem them: HUONG-DAN.txt
echo.
pause
exit /b 0
