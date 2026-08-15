@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Prima installazione: scarico i componenti. Serve Node.js, non Docker.
  call npm install
  if errorlevel 1 (
    echo.
    echo Installazione fallita. Controlla Node.js e riprova.
    pause
    exit /b 1
  )
)
echo.
echo Siderio 3D sta partendo.
echo Dalle altre postazioni apri nel browser: http://%COMPUTERNAME%:3000
echo In officina usa i QR della commessa. Questo PC deve restare acceso.
echo.
set SIDERIO_SERVE_WEB=1
set NODE_ENV=production
call npm run build
if errorlevel 1 (
  echo.
  echo Build fallita. Il server non parte.
  pause
  exit /b 1
)
call npm start
