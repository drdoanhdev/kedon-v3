@echo off
echo Starting build process...
npm run build
echo Build completed with exit code: %ERRORLEVEL%
pause
