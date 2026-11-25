<#
  一键更新在线看板：抓最新数据 → 重新生成静态页 → 提交并推送。
  推上去后 GitHub Pages 大约 30 秒内自动刷新。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish.ps1
    ... -SkipSnapshot     只重新生成页面（数据没变、只改了样式时用）
    ... -Message "自定义提交信息"
#>
param(
  [switch]$SkipSnapshot,
  [string]$Message = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $Root 'memo-history.ps1'
$Builder = Join-Path $Root 'tools\build-static.mjs'
$Proxy = 'http://127.0.0.1:7890'   # 本机 Clash；直连能用时不会走它

function Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }

if (-not $SkipSnapshot) {
  Step 1 '抓取墨墨学习记录…'
  & powershell -NoProfile -ExecutionPolicy Bypass -File $Script snapshot
  if ($LASTEXITCODE -ne 0) { throw "快照失败（退出码 $LASTEXITCODE），已中止，没有覆盖线上数据。" }
} else {
  Step 1 '跳过抓取，直接用现有 state.json'
}

Step 2 '生成静态页面…'
& node $Builder
if ($LASTEXITCODE -ne 0) { throw "生成失败（退出码 $LASTEXITCODE）。" }

Step 3 '提交并推送…'
Push-Location $Root
$eap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'   # git 的进度/行尾提示走 stderr，这里当普通输出处理
try {
  & git add -A 2>&1 | Out-Null
  $staged = (& git diff --cached --name-only) -join ''
  if (-not $staged) {
    Write-Host '  没有变化，不需要推送。' -ForegroundColor DarkGray
    return
  }
  if (-not $Message) { $Message = '更新看板数据 ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') }
  & git commit -q -m $Message 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'git commit 失败（检查仓库状态）。' }

  & git push origin main 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  直连推送失败，改用本机代理重试…' -ForegroundColor Yellow
    & git -c "http.proxy=$Proxy" push origin main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '推送失败：直连和代理都不行，检查网络后重跑本脚本（页面已经生成好了）。' }
  }
  Write-Host '  推送完成。' -ForegroundColor Green
} finally {
  $ErrorActionPreference = $eap
  Pop-Location
}

Write-Host "`n在线地址：https://sleepzzz-h.github.io/maimemo-dashboard/" -ForegroundColor Green
Write-Host 'GitHub Pages 约 30 秒后生效，刷新页面即可看到新数据。' -ForegroundColor DarkGray