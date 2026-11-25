@echo off
chcp 65001 >nul
title 墨墨难词看板
cd /d "%~dp0"
echo ============================================
echo   墨墨难词看板
echo   本机: http://localhost:8787
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo   手机: http://%%a:8787
echo   关闭这个窗口即停止服务
echo ============================================
echo.
node server.mjs
pause