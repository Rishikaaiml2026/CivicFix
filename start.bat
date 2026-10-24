@echo off
title CivicFix - Smart Public Infrastructure Issue Tracker
echo ========================================================
echo   CivicFix - Smart Public Infrastructure Issue Tracker
echo   College Hackathon 2026 - Team Tech Titans
echo ========================================================
echo.
echo Starting CivicFix Server with persistent SQLite database...
echo.

set ELECTRON_RUN_AS_NODE=1
set CODE_PATH="C:\Users\sunny_kt7m1c6\AppData\Local\Programs\Microsoft VS Code\Code.exe"

if exist %CODE_PATH% (
    start "" http://localhost:5000
    %CODE_PATH% "%~dp0server.js"
) else (
    echo [ERROR] VS Code Node executable not found at %CODE_PATH%.
    echo Falling back to system node...
    start "" http://localhost:5000
    node "%~dp0server.js"
)

pause
