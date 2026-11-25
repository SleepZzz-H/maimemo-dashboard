<#
.SYNOPSIS
  墨墨学习记录的本地「模糊/遗忘」计数器。

.DESCRIPTION
  墨墨开放 API 只给「最近一次回答」，没有逐次历史。这个脚本用每日快照 + 差分
  的方式把历史攒出来：

    snapshot  拉全量 study records，和上次快照对比，把状态变化写成事件
    report    统计每个词的 模糊(VAGUE)/忘记(FORGET)/未知 次数
    status    看数据攒了多少、上次什么时候跑的

  数据目录：脚本所在目录（-DataDir 或 MAIMEMO_HISTORY_DIR 可覆盖）
    state.json    最新一次的全量状态（voc_id -> 记录）
    events.jsonl  追加式事件流（每次运行一行一条）

.PARAMETER Mode
  snapshot | report | status（默认 snapshot）

.PARAMETER Top
  report 模式显示前多少条，默认 40

.EXAMPLE
  powershell -File memo-history.ps1 snapshot
  powershell -File memo-history.ps1 report -Top 30
#>
param(
  [ValidateSet('snapshot', 'report', 'status')]
  [string]$Mode = 'snapshot',
  [int]$Top = 40,
  [string]$DataDir = ''
)

$ErrorActionPreference = 'Stop'
# 数据默认放在脚本同目录，可用 -DataDir 或 MAIMEMO_HISTORY_DIR 覆盖。
$Root = if ($DataDir) {
  $DataDir
}
elseif ($env:MAIMEMO_HISTORY_DIR) {
  $env:MAIMEMO_HISTORY_DIR
}
else {
  $PSScriptRoot
}
$StatePath = Join-Path $Root 'state.json'
$EventsPath = Join-Path $Root 'events.jsonl'
$StampPath = Join-Path $Root 'last-run.txt'

New-Item -ItemType Directory -Force -Path $Root | Out-Null

function Invoke-CliJson {
  param([string[]]$CliArgs, [int]$Retry = 4)

  for ($i = 1; $i -le $Retry; $i++) {
    $out = @(& memo-api @CliArgs 2>&1)
    $text = (@($out) | ForEach-Object { "$_" }) -join "`n"
    $bad = @($out | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] })
    if ($bad.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($text)) { return $text }
    if ($text -match 'too_many_request|Too many') { Start-Sleep -Seconds (15 * $i); continue }
    throw ("memo-api 调用失败: " + $text)
  }
  throw ("memo-api 连续 {0} 次被限流，放弃本次快照（state 未改动）" -f $Retry)
}

function Get-WindowRecords {
  param([datetime]$Start, [datetime]$End)

  $s = $Start.ToString('yyyy-MM-dd') + 'T00:00:00+08:00'
  $e = $End.ToString('yyyy-MM-dd') + 'T00:00:00+08:00'
  $raw = Invoke-CliJson -CliArgs @('study', 'records', '-l', '1000', '-S', $s, '-E', $e, '-O', 'json')
  $obj = $raw | ConvertFrom-Json
  if ($null -eq $obj.records) { return @() }
  return @($obj.records)
}

function Get-RecordsRange {
  param([datetime]$Start, [datetime]$End, [int]$Depth = 0)

  $recs = Get-WindowRecords -Start $Start -End $End
  $spanDays = ($End - $Start).TotalDays
  if ($recs.Count -lt 1000 -or $spanDays -lt 2 -or $Depth -gt 24) { return $recs }

  $mid = $Start.AddDays([math]::Floor($spanDays / 2))
  $left = Get-RecordsRange -Start $Start -End $mid -Depth ($Depth + 1)
  $right = Get-RecordsRange -Start $mid -End $End -Depth ($Depth + 1)
  return @($left) + @($right)
}

function Get-AllRecords {
  $from = Get-Date '2020-01-01'
  $to = Get-Date '2200-01-01'
  $recs = Get-RecordsRange -Start $from -End $to
  $map = @{}
  foreach ($r in $recs) { if ($r.voc_id) { $map[$r.voc_id] = $r } }
  return $map
}

function Read-State {
  if (-not (Test-Path $StatePath)) { return $null }
  $raw = [System.IO.File]::ReadAllText($StatePath)
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return ($raw | ConvertFrom-Json)
}

function Write-Event {
  param($Id, $Word, $Kind, $Prev, $Now, $LastStudy, $Gap)
  $line = [ordered]@{
    type       = 'event'
    ts         = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
    id         = $Id
    word       = $Word
    kind       = $Kind
    prev_count = $Prev
    new_count  = $Now
    last_study = $LastStudy
    missed     = $Gap
  }
  $json = ($line | ConvertTo-Json -Compress)
  [System.IO.File]::AppendAllText($EventsPath, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-Snapshot {
  $lockPath = Join-Path $Root 'snapshot.lock'
  if (Test-Path $lockPath) {
    $age = (Get-Date) - (Get-Item $lockPath).LastWriteTime
    if ($age.TotalMinutes -lt 12) {
      Write-Host '另一个快照正在运行，本次跳过。' -ForegroundColor Yellow
      return
    }
    Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType File -Path $lockPath -Force | Out-Null
  try {
    Invoke-SnapshotCore
  }
  finally {
    Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-SnapshotCore {
  Write-Host '拉取全量学习记录...' -ForegroundColor Cyan
  $current = Get-AllRecords
  if ($current.Count -eq 0) { Write-Host '没拿到任何记录（检查 memo-api 是否可用）' -ForegroundColor Red; return }

  $prev = Read-State
  $isBaseline = ($null -eq $prev)

  if (-not $isBaseline) {
    $prevCount = 0
    if ($prev.words) { $prevCount = @($prev.words.PSObject.Properties).Count }
    if ($prevCount -gt 0 -and $current.Count -lt ($prevCount * 0.9)) {
      throw ("本次只拿到 {0} 个词，低于上次 {1} 的 90%，疑似拉取不完整，已中止（state 未改动）。" -f $current.Count, $prevCount)
    }
  }

  $state = [ordered]@{}
  $events = 0

  foreach ($id in $current.Keys) {
    $r = $current[$id]
    $state[$id] = [ordered]@{
      spelling     = $r.voc_spelling
      study_count  = [int]$r.study_count
      last_study   = $r.last_study_date
      next_study   = $r.next_study_date
      last_response = $r.last_response
      tags         = @($r.tags)
    }

    if ($isBaseline) { continue }

    $old = $null
    if ($prev.words) { $old = $prev.words.$id }
    if ($null -eq $old) { continue }

    $oldCount = [int]$old.study_count
    $newCount = [int]$r.study_count
    if ($newCount -gt $oldCount) {
      $gap = $newCount - $oldCount
      Write-Event -Id $id -Word $r.voc_spelling -Kind $r.last_response -Prev $oldCount -Now $newCount -LastStudy $r.last_study_date -Gap $gap
      $events++
      if ($gap -gt 1) {
        Write-Event -Id $id -Word $r.voc_spelling -Kind 'UNKNOWN' -Prev $oldCount -Now $newCount -LastStudy $r.last_study_date -Gap ($gap - 1)
        $events += ($gap - 1)
      }
    }
  }

  $payload = [ordered]@{
    updatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
    baseline  = $isBaseline
    count     = $state.Count
    words     = $state
  }
  [System.IO.File]::WriteAllText($StatePath, ($payload | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))

  if ($isBaseline) {
    Write-Event -Id '' -Word '' -Kind 'BASELINE' -Prev 0 -Now $state.Count -LastStudy '' -Gap 0
  }

  (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz') | Set-Content -Path $StampPath -Encoding ASCII

  if ($isBaseline) {
    Write-Host ("基线已建立：{0} 个词。从下一次运行开始计模糊/遗忘次数。" -f $state.Count) -ForegroundColor Green
  }
  else {
    Write-Host ("快照完成：{0} 个词，新增 {1} 条事件。" -f $state.Count, $events) -ForegroundColor Green
  }
}

function Invoke-Report {
  if (-not (Test-Path $EventsPath)) { Write-Host '还没有事件数据，先跑一次 snapshot 建立基线。' -ForegroundColor Yellow; return }

  $state = Read-State
  $stats = @{}
  $lines = 0
  foreach ($line in [System.IO.File]::ReadLines($EventsPath)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $ev = $line | ConvertFrom-Json
    if ($ev.kind -eq 'BASELINE') { continue }
    $lines++
    if (-not $stats.ContainsKey($ev.id)) {
      $stats[$ev.id] = [ordered]@{ word = $ev.word; vague = 0; forget = 0; familiar = 0; unknown = 0; total = 0 }
    }
    $s = $stats[$ev.id]
    switch ($ev.kind) {
      'VAGUE'         { $s.vague++ }
      'FORGET'        { $s.forget++ }
      'FAMILIAR'      { $s.familiar++ }
      'WELL_FAMILIAR' { $s.familiar++ }
      'UNKNOWN'       { $s.unknown++ }
      default         { $s.unknown++ }
    }
    $s.total++
  }

  if ($lines -eq 0) {
    Write-Host '还没有累计到任何事件（只有基线）。等下次复习后再跑 snapshot。' -ForegroundColor Yellow
    return
  }

  $rows = foreach ($k in $stats.Keys) {
    $s = $stats[$k]
    $cur = $null
    if ($state -and $state.words) { $cur = $state.words.$k }
    [pscustomobject]@{
      单词     = $s.word
      模糊     = $s.vague
      忘记     = $s.forget
      熟悉     = $s.familiar
      未知     = $s.unknown
      累计事件 = $s.total
      当前次数 = if ($cur) { [int]$cur.study_count } else { 0 }
      最近状态 = if ($cur) { $cur.last_response } else { '' }
    }
  }

  $sorted = $rows | Sort-Object -Property @{ Expression = { $_.模糊 + $_.忘记 * 2 }; Descending = $true }, @{ Expression = { $_.累计事件 }; Descending = $true }

  Write-Host ("事件总数: {0} | 涉及单词: {1}" -f $lines, $stats.Count) -ForegroundColor Cyan
  $sorted | Select-Object -First $Top | Format-Table -AutoSize | Out-String -Width 140 | Write-Host

  $sumV = ($rows | Measure-Object 模糊 -Sum).Sum
  $sumF = ($rows | Measure-Object 忘记 -Sum).Sum
  Write-Host ("全站累计：模糊 {0} 次，忘记 {1} 次，未知 {2} 次" -f $sumV, $sumF, (($rows | Measure-Object 未知 -Sum).Sum)) -ForegroundColor Green
}

switch ($Mode) {
  'snapshot' { Invoke-Snapshot }
  'report'   { Invoke-Report }
  'status'   {
    $state = Read-State
    if ($null -eq $state) { Write-Host '尚未初始化。' -ForegroundColor Yellow; return }
    Write-Host ("数据目录: {0}" -f $Root)
    Write-Host ("上次快照: {0}" -f $state.updatedAt)
    Write-Host ("收录词数: {0}" -f $state.count)
    if (Test-Path $EventsPath) {
      $cnt = ([System.IO.File]::ReadAllLines($EventsPath) | Where-Object { $_ -match '"kind":"(VAGUE|FORGET|FAMILIAR|WELL_FAMILIAR|UNKNOWN)"' }).Count
      Write-Host ("累计事件: {0}" -f $cnt)
    }
    else { Write-Host '累计事件: 0' }
  }
}