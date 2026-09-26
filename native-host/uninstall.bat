@echo off
chcp 65001 >nul
setlocal
rem Power Link — 다른 프로필 연동 도우미 제거 (설치 전 상태로 되돌림)

reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.powerlink.bridge" /f >nul 2>&1

set "HOSTDIR=%LOCALAPPDATA%\PowerLink\bridge-host"
set "DATADIR=%LOCALAPPDATA%\PowerLink\bridge"
if exist "%HOSTDIR%" rmdir /s /q "%HOSTDIR%"
if exist "%DATADIR%" rmdir /s /q "%DATADIR%"
rmdir "%LOCALAPPDATA%\PowerLink" 2>nul

echo Power Link 다른 프로필 연동 도우미를 제거했어요.
echo (크롬이 실행 중이면 완전히 종료했다가 다시 시작해 주세요.)
endlocal
