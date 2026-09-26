@echo off
setlocal
rem Power Link - cross-profile bridge uninstaller (reverts install.bat).
rem Korean guide: see native-host/README.md

reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.powerlink.bridge" /f >nul 2>&1

set "HOSTDIR=%LOCALAPPDATA%\PowerLink\bridge-host"
set "DATADIR=%LOCALAPPDATA%\PowerLink\bridge"
if exist "%HOSTDIR%" rmdir /s /q "%HOSTDIR%"
if exist "%DATADIR%" rmdir /s /q "%DATADIR%"
rmdir "%LOCALAPPDATA%\PowerLink" 2>nul

echo [OK] Power Link bridge helper removed.
echo (If Chrome is running, restart it completely.)
endlocal
