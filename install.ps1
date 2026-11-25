# 墨墨难词看板 · 一键安装
# 做三件事：桌面图标、开始菜单图标、开机后台自启（都点一下就能打开看板）
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$app = Join-Path $root 'app'
$ico = Join-Path $app 'icons\favicon.ico'

Write-Host ''
Write-Host '  墨墨难词看板 · 安装' -ForegroundColor Cyan
Write-Host '  -----------------------------' -ForegroundColor DarkGray

# 1) 图标
if (-not (Test-Path $ico)) {
  Write-Host '  [1/4] 生成图标…'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tools\make-icons.ps1') | Out-Null
} else {
  Write-Host '  [1/4] 图标已就绪'
}

# 2) Node 检查
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host '  [2/4] 没找到 node.exe，请先安装 Node.js 18+' -ForegroundColor Yellow
  Write-Host '        https://nodejs.org/' -ForegroundColor DarkGray
  Read-Host '  按回车退出'
  exit 1
}
Write-Host ('  [2/4] Node: ' + $node)

# 3) 快捷方式
$shell = New-Object -ComObject WScript.Shell
function New-Shortcut {
  param([string]$Path, [string]$Script, [string]$Description)
  $lnk = $shell.CreateShortcut($Path)
  $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $lnk.Arguments = '"' + $Script + '"'
  $lnk.WorkingDirectory = $app
  $lnk.IconLocation = $ico + ',0'
  $lnk.Description = $Description
  $lnk.WindowStyle = 7
  $lnk.Save()
  Write-Host ('        -> ' + $Path)
}

$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$startup = [Environment]::GetFolderPath('Startup')

Write-Host '  [3/4] 创建图标'
New-Shortcut -Path (Join-Path $desktop '墨墨难词看板.lnk') -Script (Join-Path $app 'launch.vbs') -Description '打开墨墨难词看板（自动在后台启动服务）'
New-Shortcut -Path (Join-Path $startMenu '墨墨难词看板.lnk') -Script (Join-Path $app 'launch.vbs') -Description '打开墨墨难词看板'
New-Shortcut -Path (Join-Path $startup '墨墨难词看板（后台启动）.lnk') -Script (Join-Path $app 'autostart.vbs') -Description '开机后在后台启动墨墨难词看板服务'

# 4) 立刻起一次，确认能开
Write-Host '  [4/4] 启动服务…'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'open-dashboard.ps1') -NoBrowser

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:8787/api/health' -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {
    # 服务还没起来，或者这个 shell 冷启动太慢，继续等
  }
}
if (-not $ok) {
  # 退一步：端口能连上也算起来了
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect('127.0.0.1', 8787, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(1000)) { $client.EndConnect($iar); $ok = $true }
  } catch { }
  $client.Close()
}

Write-Host ''
if ($ok) {
  Write-Host '  装好了。' -ForegroundColor Green
} else {
  Write-Host '  服务好像没起来，先双击 app\start.cmd 看报错信息。' -ForegroundColor Yellow
  Write-Host '  （错误也会写进 server.error.log）' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  电脑：双击桌面「墨墨难词看板」图标，或者开始菜单里找它。' -ForegroundColor Gray
Write-Host '  手机：和电脑连同一个 Wi-Fi，浏览器打开 http://<电脑局域网IP>:8787' -ForegroundColor Gray
Write-Host '        然后在 Chrome 菜单里「添加到主屏幕」/ Safari 分享里「添加到主屏幕」。' -ForegroundColor Gray

$upAliases = @()
try {
  $upAliases = @(Get-NetAdapter -ErrorAction Stop | Where-Object { $_.Status -eq 'Up' } | Select-Object -ExpandProperty InterfaceAlias)
} catch { }
$lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and
    ($upAliases.Count -eq 0 -or $upAliases -contains $_.InterfaceAlias)
  }
if ($lan) {
  Write-Host '  本机地址：' -ForegroundColor Gray
  foreach ($a in $lan) { Write-Host ('        http://' + $a.IPAddress + ':8787   (' + $a.InterfaceAlias + ')') -ForegroundColor Gray }
}

$hasRule = $false
try {
  $hasRule = [bool](Get-NetFirewallRule -DisplayName 'Maimemo Dashboard 8787' -ErrorAction SilentlyContinue)
} catch { }
if (-not $hasRule) {
  Write-Host ''
  Write-Host '  提示：如果手机打不开，右键「以管理员身份运行」app\allow-lan.cmd 放行 8787 端口。' -ForegroundColor DarkYellow
}

Write-Host ''
Read-Host '  按回车关闭'