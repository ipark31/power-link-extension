@echo off
setlocal
rem Power Link - cross-profile bridge installer (current user only, no admin).
rem Usage: install.bat [extensionId]   (default: the id of the dist folder)
rem Korean guide: see native-host/README.md

set "HOSTDIR=%LOCALAPPDATA%\PowerLink\bridge-host"
set "EXTID=%~1"
if "%EXTID%"=="" set "EXTID=hdepgbapmhdgdknjhoecmckmchiacjgp"

if not exist "%HOSTDIR%" mkdir "%HOSTDIR%"
copy /Y "%~dp0powerlink-bridge.ps1" "%HOSTDIR%\" >nul
copy /Y "%~dp0host.bat" "%HOSTDIR%\" >nul
if errorlevel 1 (
  echo [FAIL] could not copy host files to %HOSTDIR%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=$env:HOSTDIR; $m=[ordered]@{name='com.powerlink.bridge';description='Power Link cross-profile bridge';path=(Join-Path $d 'host.bat');type='stdio';allowed_origins=@(('chrome-extension://'+$env:EXTID+'/'))}; [System.IO.File]::WriteAllText((Join-Path $d 'com.powerlink.bridge.json'),(ConvertTo-Json $m),(New-Object System.Text.UTF8Encoding($false)))"
if errorlevel 1 (
  echo [FAIL] could not write the native messaging manifest
  exit /b 1
)

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.powerlink.bridge" /ve /t REG_SZ /d "%HOSTDIR%\com.powerlink.bridge.json" /f >nul
if errorlevel 1 (
  echo [FAIL] could not register the HKCU registry key
  exit /b 1
)

echo.
echo [OK] Power Link bridge helper installed.
echo   - location : %HOSTDIR%
echo   - extension: %EXTID%
echo.
echo Restart Chrome completely, or click [Reconnect] at the top of the
echo side panel's Recent screens tab. Run uninstall.bat to remove.
endlocal
