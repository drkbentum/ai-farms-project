@echo off
echo ============================================
echo   AI Farms Project - Public Server Setup
echo ============================================
echo.
echo This will make your website accessible to farmers worldwide.
echo.

REM Step 1: Check ngrok auth token
set /p "NGROK_TOKEN=Enter your ngrok auth token (get free one at https://ngrok.com/signup): "

if "%NGROK_TOKEN%"=="" (
    echo Error: Auth token is required.
    pause
    exit /b 1
)

echo.
echo Setting up ngrok...
ngrok config add-authtoken %NGROK_TOKEN%
if errorlevel 1 (
    echo Error: Failed to set ngrok auth token.
    pause
    exit /b 1
)

REM Save token for future use
echo %NGROK_TOKEN% > .ngrok_token
echo Auth token saved.
echo.

REM Step 2: Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

REM Step 3: Start the server
echo.
echo Starting AI Farms Project server...
start /B node server.js

REM Step 4: Wait for server to be ready
echo Waiting for server to start...
timeout /t 3 /nobreak >nul

REM Step 5: Start ngrok and get public URL
echo.
echo Starting ngrok tunnel...
echo.
start "" ngrok http 3000

echo.
echo ============================================
echo   Your website is being started!
echo ============================================
echo.
echo A browser window should open with ngrok.
echo Copy the "Forwarding" URL (https://...ngrok-free.app)
echo and share it with farmers.
echo.
echo Press any key to stop everything.
pause >nul

echo Stopping services...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
exit
