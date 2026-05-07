@echo off
echo ============================================
echo   AI Farms Project
echo ============================================
echo.
echo Select mode:
echo   1 - Local only (just your computer)
echo   2 - Public (share with farmers worldwide)
echo.
set /p "CHOICE=Enter 1 or 2: "

if "%CHOICE%"=="2" goto public
goto local

:local
echo.
echo Starting local server...
node server.js
pause
exit

:public
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0start-public.ps1"
pause
