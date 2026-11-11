@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 22.12 or newer from https://nodejs.org, then try again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed. Check the error above.
    pause
    exit /b 1
  )
)
echo Starting New Dawn. Keep this window open while you explore.
echo Press Ctrl+C to stop the server.
call npm.cmd run dev -- --open
pause
