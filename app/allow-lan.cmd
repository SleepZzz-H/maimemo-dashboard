@echo off
chcp 65001 >nul
title 开放手机访问（8787 端口）
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo 需要管理员权限，正在申请提权，请在弹出的窗口点「是」...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo 正在为本机防火墙放行 8787 端口（仅限同一局域网）...
netsh advfirewall firewall delete rule name="Maimemo Dashboard 8787" >nul 2>&1
netsh advfirewall firewall add rule name="Maimemo Dashboard 8787" dir=in action=allow protocol=TCP localport=8787 profile=any remoteip=localsubnet enable=yes
echo.
echo 完成。手机与本机连同一个 Wi-Fi 后，用下面的地址访问：
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo   http://%%a:8787
echo.
echo 如果手机打不开，多半是校园网把无线和有线隔离了，试试手机热点。
pause