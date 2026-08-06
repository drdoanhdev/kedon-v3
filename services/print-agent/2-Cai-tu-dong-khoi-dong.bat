@echo off
chcp 65001 >nul
title Cai tu dong khoi dong Optigo Print Agent
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\OptigoPrintAgent.lnk"
set "TARGET=%~dp01-Chay-agent.bat"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%LINK%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()"

echo.
echo  Da them Optigo Print Agent vao khoi dong Windows.
echo  Lan sau bat may, agent se tu mo (cua so thu nho).
echo.
echo  De tat: xoa file shortcut trong thu muc Startup:
echo  %STARTUP%
echo.
pause
