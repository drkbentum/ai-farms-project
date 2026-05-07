$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  AI Farms Project - Public Server" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $projectDir

if (Test-Path ".ngrok_token") {
    Write-Host "Using saved ngrok token..." -ForegroundColor Green
    $token = Get-Content ".ngrok_token"
    & "$projectDir\ngrok.exe" config add-authtoken $token | Out-Null
} else {
    Write-Host "First time setup - you need a free ngrok auth token." -ForegroundColor Yellow
    Write-Host "1. Go to https://ngrok.com/signup and create a free account" -ForegroundColor Yellow
    Write-Host "2. Copy your auth token from the dashboard" -ForegroundColor Yellow
    Write-Host ""
    $token = Read-Host "Paste your ngrok auth token here"
    & "$projectDir\ngrok.exe" config add-authtoken $token
    $token | Out-File ".ngrok_token"
    Write-Host "Token saved for future use." -ForegroundColor Green
}

Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    npm install
}

Write-Host ""
Write-Host "Starting AI Farms Project server..." -ForegroundColor Green
$nodeProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectDir'; node server.js" -WindowStyle Minimized -PassThru

Start-Sleep -Seconds 3

Write-Host "Starting ngrok tunnel..." -ForegroundColor Green
$ngrokProcess = Start-Process "$projectDir\ngrok.exe" -ArgumentList "http", "3000" -WindowStyle Normal -PassThru

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Your website is PUBLICLY ACCESSIBLE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The ngrok window shows your public URL." -ForegroundColor Yellow
Write-Host "Look for the line: Forwarding  https://xxxx.ngrok-free.app" -ForegroundColor Yellow
Write-Host ""
Write-Host "Copy that URL and share it with farmers." -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to stop the server..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "ngrok" -Force -ErrorAction SilentlyContinue
Write-Host "Server stopped." -ForegroundColor Green
