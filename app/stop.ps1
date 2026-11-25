# 停止后台的墨墨难词看板服务（只停监听 8787 且确实是 server.mjs 的进程）
$ErrorActionPreference = 'SilentlyContinue'
$conn = Get-NetTCPConnection -LocalPort 8787 -State Listen | Select-Object -First 1
if (-not $conn) {
  Write-Host '服务没在运行。' -ForegroundColor Gray
  exit 0
}
$procId = $conn.OwningProcess
$info = Get-CimInstance Win32_Process -Filter "ProcessId=$procId"
$cmd = ''
if ($info) { $cmd = [string]$info.CommandLine }
if ($cmd -match 'server\.mjs') {
  Stop-Process -Id $procId -Force
  Write-Host ('已停止看板服务（PID ' + $procId + '）。') -ForegroundColor Green
} else {
  Write-Host ('8787 端口被别的程序占用：PID ' + $procId + ' / ' + $cmd) -ForegroundColor Yellow
  Write-Host '没有动它，请自己确认。' -ForegroundColor Gray
}