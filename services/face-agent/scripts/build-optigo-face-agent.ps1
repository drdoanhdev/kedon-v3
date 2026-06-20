# Build OptigoFaceAgent.zip for clinic distribution (no Python knowledge required)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$distDir = Join-Path $root "dist"
$publicDir = Join-Path (Split-Path -Parent (Split-Path -Parent $root)) "public\downloads"
$staging = Join-Path $distDir "OptigoFaceAgent"
$zipPath = Join-Path $distDir "OptigoFaceAgent.zip"
$publicZipPath = Join-Path $publicDir "OptigoFaceAgent.zip"

$include = @(
    "agent",
    "main.py",
    "requirements.txt",
    "config.example.json",
    "cai-dat.bat",
    "chay-agent.bat",
    "ghep-noi.bat",
    "dang-ky-khuon-mat.bat",
    "_env.bat",
    "HUONG-DAN.txt",
    "README.md"
)

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

foreach ($item in $include) {
    $src = Join-Path $root $item
    if (-not (Test-Path $src)) {
        Write-Error "Missing: $src"
    }
    Copy-Item $src -Destination $staging -Recurse -Force
}

# Strip bytecode cache if present
Get-ChildItem $staging -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force }

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -Force
Remove-Item $staging -Recurse -Force

New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
Copy-Item $zipPath -Destination $publicZipPath -Force

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Created: $zipPath ($sizeMb MB)"
Write-Host "Public URL path: /downloads/OptigoFaceAgent.zip"
Write-Host "Copied to: $publicZipPath"
