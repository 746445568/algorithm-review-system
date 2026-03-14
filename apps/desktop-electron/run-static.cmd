@echo off
setlocal

pushd "%~dp0"
if errorlevel 1 exit /b %errorlevel%

if defined ELECTRON_RUN_AS_NODE (
  echo [desktop-electron] Clearing inherited ELECTRON_RUN_AS_NODE=%ELECTRON_RUN_AS_NODE%
)
set "ELECTRON_RUN_AS_NODE="

powershell -NoProfile -ExecutionPolicy Bypass -File ".\prepare-service.ps1"
if errorlevel 1 (
  set EXITCODE=%errorlevel%
  popd
  exit /b %EXITCODE%
)

node ".\scripts\start-static.mjs"
set EXITCODE=%errorlevel%
popd
exit /b %EXITCODE%
