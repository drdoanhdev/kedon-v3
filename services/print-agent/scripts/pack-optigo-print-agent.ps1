# Đóng gói Optigo Print Agent thành zip để cửa hàng tải về.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $root 'dist'
$privateDir = Join-Path (Split-Path -Parent (Split-Path -Parent $root)) 'private\downloads'
$zipName = 'OptigoPrintAgent.zip'
$stage = Join-Path $distDir 'stage'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

$files = @(
  '1-Chay-agent.bat',
  '2-Cai-tu-dong-khoi-dong.bat',
  'print-agent.ps1',
  'HUONG-DAN.txt'
)

foreach ($f in $files) {
  $src = Join-Path $root $f
  if (-not (Test-Path $src)) { throw "Thieu file: $src" }
  Copy-Item $src (Join-Path $stage $f) -Force
}

$zipPath = Join-Path $distDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -Force

New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
Copy-Item $zipPath (Join-Path $privateDir $zipName) -Force

Remove-Item $stage -Recurse -Force

Write-Host "OK: $zipPath"
Write-Host "OK: $(Join-Path $privateDir $zipName)"
