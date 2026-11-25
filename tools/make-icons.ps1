# Generates app icons (PNG + multi-size ICO) for the dashboard.
# ASCII only: PowerShell 5.1 reads BOM-less files as GBK.
Add-Type -AssemblyName System.Drawing

$root   = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root 'app\icons'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

function New-RoundedPath {
  param([single]$x, [single]$y, [single]$w, [single]$h, [single]$r)
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
  $p.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
  $p.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-IconBitmap {
  param([int]$S, [switch]$Flat)
  $bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $radius = [single]($S * 0.23)
  if (-not $Flat) {
    $path = New-RoundedPath 0 0 $S $S $radius
  } else {
    $path = New-RoundedPath 0 0 $S $S ([single]($S * 0.0001))
  }
  $rect = New-Object System.Drawing.RectangleF(0, 0, $S, $S)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 79, 70, 229),
    [System.Drawing.Color]::FromArgb(255, 6, 182, 212),
    40)
  $g.FillPath($grad, $path)

  # bookmark ribbon (kept inside the maskable safe zone)
  $scale = if ($Flat) { 0.80 } else { 1.0 }
  $bw = [single]($S * 0.30 * $scale)
  $bh = [single]($S * 0.50 * $scale)
  $bx = [single](($S - $bw) / 2)
  $by = [single](($S - $bh) / 2 - $S * 0.02)
  $notch = [single]($S * 0.115 * $scale)
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $pts = @(
    (New-Object System.Drawing.PointF($bx, $by)),
    (New-Object System.Drawing.PointF(($bx + $bw), $by)),
    (New-Object System.Drawing.PointF(($bx + $bw), ($by + $bh))),
    (New-Object System.Drawing.PointF(($bx + $bw / 2), ($by + $bh - $notch))),
    (New-Object System.Drawing.PointF($bx, ($by + $bh)))
  )
  $g.FillPolygon($white, $pts)

  $white.Dispose(); $grad.Dispose(); $path.Dispose(); $g.Dispose()
  return $bmp
}

$pngTargets = @{
  192 = 'icon-192.png'
  256 = 'icon-256.png'
  384 = 'icon-384.png'
  512 = 'icon-512.png'
  180 = 'apple-touch-icon.png'
}

foreach ($size in $pngTargets.Keys) {
  $bmp = New-IconBitmap -S $size
  $file = Join-Path $iconDir $pngTargets[$size]
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host ("png  {0,4}px -> {1}" -f $size, $pngTargets[$size])
}

# full-bleed variant for Android maskable icons
$maskBmp = New-IconBitmap -S 512 -Flat
$maskBmp.Save((Join-Path $iconDir 'icon-maskable-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$maskBmp.Dispose()
Write-Host 'png   512px -> icon-maskable-512.png (full bleed)'

# multi-resolution .ico with PNG payloads (Vista+)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$payloads = New-Object System.Collections.Generic.List[byte[]]
foreach ($s in $sizes) {
  $bmp = New-IconBitmap -S $s
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $payloads.Add($ms.ToArray())
  $bmp.Dispose(); $ms.Dispose()
}

$icoPath = Join-Path $iconDir 'favicon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $dim = if ($s -ge 256) { 0 } else { $s }
  $data = $payloads[$i]
  $bw.Write([Byte]$dim); $bw.Write([Byte]$dim)
  $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$data.Length); $bw.Write([UInt32]$offset)
  $offset += $data.Length
}
foreach ($d in $payloads) { $bw.Write([byte[]]$d) }
$bw.Flush(); $bw.Close(); $fs.Close()

$copy = Join-Path $root 'app\favicon.ico'
Copy-Item $icoPath $copy -Force
Write-Host ("ico  {0} sizes -> {1} ({2} bytes)" -f $sizes.Count, 'app\icons\favicon.ico', (Get-Item $icoPath).Length)