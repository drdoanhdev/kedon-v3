@echo off
REM Mo cua so CMD khi double-click. Goi: call "%~dp0_ensure_console.bat" "Tieu de" "%~f0" %*
REM Lan 2 (co --run o %3): cho phep script tiep tuc.
if /i "%~3"=="--run" exit /b 0
start "%~1" /D "%~dp0" cmd /k ""%~2" --run"
exit /b 1
