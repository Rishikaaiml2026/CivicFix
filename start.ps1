# CivicFix - Smart Public Infrastructure Issue Tracker
# PowerShell Startup Script

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  CivicFix - Smart Public Infrastructure Issue Tracker  " -ForegroundColor Cyan
Write-Host "  College Hackathon 2026 - Team Tech Titans             " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$env:ELECTRON_RUN_AS_NODE = "1"
$codePath = "C:\Users\sunny_kt7m1c6\AppData\Local\Programs\Microsoft VS Code\Code.exe"

Start-Process "http://localhost:5000"

if (Test-Path $codePath) {
    Write-Host "Starting server via Node v24 runtime at http://localhost:5000 ..." -ForegroundColor Yellow
    & $codePath "$PSScriptRoot\server.js"
} else {
    Write-Host "Starting server via default node at http://localhost:5000 ..." -ForegroundColor Yellow
    node "$PSScriptRoot\server.js"
}
