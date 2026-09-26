@echo off
chcp 65001 >nul
setlocal
rem Power Link — 다른 프로필 연동 도우미 설치 (현재 사용자 범위, 관리자 권한 불필요)
rem 사용법: install.bat [확장ID]   (생략하면 dist 폴더 기준 ID를 사용)

set "HOSTDIR=%LOCALAPPDATA%\PowerLink\bridge-host"
set "EXTID=%~1"
if "%EXTID%"=="" set "EXTID=hdepgbapmhdgdknjhoecmckmchiacjgp"

if not exist "%HOSTDIR%" mkdir "%HOSTDIR%"
copy /Y "%~dp0powerlink-bridge.ps1" "%HOSTDIR%\" >nul
copy /Y "%~dp0host.bat" "%HOSTDIR%\" >nul
if errorlevel 1 (
  echo 파일 복사에 실패했어요. 경로를 확인해 주세요: %HOSTDIR%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=$env:HOSTDIR; $m=[ordered]@{name='com.powerlink.bridge';description='Power Link cross-profile bridge';path=(Join-Path $d 'host.bat');type='stdio';allowed_origins=@(('chrome-extension://'+$env:EXTID+'/'))}; [System.IO.File]::WriteAllText((Join-Path $d 'com.powerlink.bridge.json'),(ConvertTo-Json $m),(New-Object System.Text.UTF8Encoding($false)))"
if errorlevel 1 (
  echo 매니페스트 파일 생성에 실패했어요.
  exit /b 1
)

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.powerlink.bridge" /ve /t REG_SZ /d "%HOSTDIR%\com.powerlink.bridge.json" /f >nul
if errorlevel 1 (
  echo 레지스트리 등록에 실패했어요.
  exit /b 1
)

echo.
echo Power Link 다른 프로필 연동 도우미를 설치했어요.
echo   - 위치: %HOSTDIR%
echo   - 허용 확장 ID: %EXTID%
echo.
echo 크롬을 완전히 종료했다가 다시 시작하거나,
echo 사이드바 '최근 화면' 상단의 [다시 연결]을 누르세요.
echo 제거하려면 uninstall.bat 을 실행하면 돼요.
endlocal
