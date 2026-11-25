# 卸载：删掉桌面/开始菜单/开机自启的图标，并停掉后台服务（数据保留）
$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot

Write-Host ''
Write-Host '  卸载墨墨难词看板的图标与自启' -ForegroundColor Cyan
Write-Host '  -----------------------------' -ForegroundColor DarkGray

$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) '墨墨难词看板.lnk'),
  (Join-Path (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs') '墨墨难词看板.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Startup')) '墨墨难词看板（后台启动）.lnk')
)

foreach ($t in $targets) {
  if (Test-Path $t) {
    Remove-Item $t -Force
    Write-Host ('  已删除 ' + $t) -ForegroundColor Green
  } else {
    Write-Host ('  跳过（不存在）' + $t) -ForegroundColor DarkGray
  }
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'app\stop.ps1')

Write-Host ''
Write-Host ('  数据都还在：' + $root) -ForegroundColor Gray
Write-Host '  （state.json、events.jsonl、server.log，不需要了就整个目录删掉）' -ForegroundColor DarkGray
Write-Host ''
Read-Host '  按回车关闭'