@echo off
rem Power Link bridge host launcher - Chrome runs this via native messaging.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0powerlink-bridge.ps1"
