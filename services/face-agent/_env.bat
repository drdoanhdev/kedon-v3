@echo off
REM Shared paths for Optigo Face Agent batch scripts
set "AGENT_DIR=%~dp0"
set "AGENT_DIR=%AGENT_DIR:~0,-1%"
set "VENV_PY=%AGENT_DIR%\.venv\Scripts\python.exe"
set "VENV_PIP=%AGENT_DIR%\.venv\Scripts\pip.exe"

if exist "%VENV_PY%" (
  set "PYTHON=%VENV_PY%"
  set "PIP=%VENV_PIP%"
  exit /b 0
)

set "PYTHON="
set "PIP="

where py >nul 2>&1
if %errorlevel%==0 (
  for /f "delims=" %%i in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON=%%i"
)

if not defined PYTHON (
  where python >nul 2>&1
  if %errorlevel%==0 (
    for /f "delims=" %%i in ('python -c "import sys; print(sys.executable)" 2^>nul') do set "PYTHON=%%i"
  )
)

if not defined PYTHON exit /b 1

for %%i in ("%PYTHON%") do set "PIP=%%~dpipip.exe"
if not exist "%PIP%" set "PIP=%PYTHON% -m pip"
exit /b 0
