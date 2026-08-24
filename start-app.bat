@echo off
setlocal enabledelayedexpansion

rem One-click launch for Lift.
rem
rem Named start-app.bat and not start.bat: cmd matches internal command
rem names up to the first dot, so typing "start.bat" runs the built-in
rem START command with an argument of ".bat" and silently opens an empty
rem console instead of this script.

cd /d "%~dp0"

set PORT=5183
set URL=http://localhost:%PORT%

echo.
echo   Lift
echo   ----
echo.

rem --- Prerequisites -------------------------------------------------
where pnpm >nul 2>nul
if errorlevel 1 (
    echo   pnpm was not found on PATH.
    echo.
    echo   Install Node.js from https://nodejs.org and then run:
    echo       npm install -g pnpm
    echo.
    pause
    exit /b 1
)

rem --- Dependencies --------------------------------------------------
if not exist "node_modules" (
    echo   Installing dependencies. This only happens on a fresh clone.
    call pnpm install
    if errorlevel 1 (
        echo.
        echo   pnpm install failed. See the output above.
        echo.
        pause
        exit /b 1
    )
    echo.
)

rem --- Port --------------------------------------------------------
rem The dev server is pinned with --strictPort, so an occupied port is a
rem hard failure rather than a silent move to the next one. Checking here
rem means the message names the port instead of the server exiting with a
rem stack trace inside a window that closes.
netstat -ano | findstr /R /C:"LISTENING" | findstr /C:":%PORT% " >nul
if not errorlevel 1 (
    echo   Port %PORT% is already in use.
    echo.
    echo   Something else is listening there - most likely Lift is already
    echo   running. Try opening %URL% first.
    echo.
    echo   To find what holds it:
    echo       netstat -ano ^| findstr :%PORT%
    echo.
    pause
    exit /b 1
)

rem --- Start -------------------------------------------------------
echo   Starting the dev server on port %PORT%...
start "Lift dev server" cmd /k "pnpm dev --port %PORT% --strictPort"

rem --- Wait for it to actually accept connections ---------------------
rem Opening the browser on a timer races the server on a cold start and
rem lands the user on a connection-refused page.
set /a ATTEMPTS=0
:waitloop
set /a ATTEMPTS+=1
if !ATTEMPTS! GTR 40 goto :timeout

powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto :waitloop
)

echo   Ready. Opening %URL%
start "" "%URL%"

echo.
echo   Lift is running in the "Lift dev server" window.
echo   Close that window, or press Ctrl+C in it, to stop the app.
echo.
echo   Your training data is stored in this browser. Export a backup from
echo   Settings before clearing site data - see docs/PERSISTENCE.md.
echo.
exit /b 0

:timeout
echo.
echo   The server did not start listening on port %PORT% within 40 seconds.
echo   Check the "Lift dev server" window for the error.
echo.
pause
exit /b 1
