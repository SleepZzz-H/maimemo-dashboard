# Starts the local dashboard server in the background and, unless -NoBrowser is
# given, opens it in the default browser.
# ASCII only: PowerShell 5.1 reads BOM-less files as GBK.
param([switch]$NoBrowser)

$ErrorActionPreference = 'SilentlyContinue'
$app = $PSScriptRoot
$root = Split-Path -Parent $app
$port = 8787
$log = Join-Path $root 'launcher-error.log'

function Test-Port {
  param([int]$Port)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(500)) { $client.Close(); return $false }
    $client.EndConnect($iar)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Port -Port $port)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
  if (-not (Test-Path $node)) {
    ("node.exe not found. Install Node.js 18+ first. Looked at: " + $node) |
      Out-File -FilePath $log -Encoding utf8 -Append
    exit 1
  }
  $outLog = Join-Path $root 'server.log'
  $errLog = Join-Path $root 'server.error.log'
  Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $app `
    -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Port -Port $port) { break }
  }
}

if (-not $NoBrowser) {
  Start-Process "http://localhost:$port"
}