# Build OptigoFaceAgent.zip for authenticated clinic download (NOT public web root)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$distDir = Join-Path $root "dist"
$repoRoot = Split-Path -Parent (Split-Path -Parent $root)
$privateDir = Join-Path $repoRoot "private\downloads"
$staging = Join-Path $distDir "OptigoFaceAgent"
$zipPath = Join-Path $distDir "OptigoFaceAgent.zip"
$privateZipPath = Join-Path $privateDir "OptigoFaceAgent.zip"
$publicZipPath = Join-Path $repoRoot "public\downloads\OptigoFaceAgent.zip"

$include = @(
    "agent",
    "main.py",
    "requirements.txt",
    "config.example.json",
    "optigo-setup.bat",
    "giao-dien-cai-dat.bat",
    "cai-dat.bat",
    "cau-hinh-camera.bat",
    "chay-agent.bat",
    "ghep-noi.bat",
    "dang-ky-khuon-mat.bat",
    "_env.bat",
    "_ensure_console.bat",
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

# Private storage only — served via /api/face-devices/download-agent after auth
New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
Copy-Item $zipPath -Destination $privateZipPath -Force

# Remove legacy public copy if present (do not redistribute as anonymous download)
if (Test-Path $publicZipPath) {
    Remove-Item $publicZipPath -Force
    Write-Host "Removed public copy: $publicZipPath"
}

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Created: $zipPath ($sizeMb MB)"
Write-Host "Private path: $privateZipPath"
Write-Host "Download via authenticated API: GET /api/face-devices/download-agent"
