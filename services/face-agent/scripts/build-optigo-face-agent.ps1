# Build OptigoFaceAgent.zip — PyInstaller (không ship .py thuần khi build thành công)
# Yêu cầu: pip install pyinstaller (trong .venv của face-agent)
param(
    [switch]$SourceOnly
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$distDir = Join-Path $root "dist"
$repoRoot = Split-Path -Parent (Split-Path -Parent $root)
$privateDir = Join-Path $repoRoot "private\downloads"
$staging = Join-Path $distDir "OptigoFaceAgent"
$zipPath = Join-Path $distDir "OptigoFaceAgent.zip"
$privateZipPath = Join-Path $privateDir "OptigoFaceAgent.zip"
$publicZipPath = Join-Path $repoRoot "public\downloads\OptigoFaceAgent.zip"
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$exeName = "optigo-face-agent.exe"

function Write-DistBat($name, $args) {
    $content = @"
@echo off
cd /d "%~dp0"
call "%~dp0_ensure_console.bat" "Optigo Face Agent" "%~f0" %*
if errorlevel 1 exit /b 0
chcp 65001 >nul
if not exist "$exeName" (
  echo Thieu $exeName. Hay build lai bang npm run pack:face-agent
  pause
  exit /b 1
)
"$exeName" $args
if %errorlevel% neq 0 pause
"@
    Set-Content -Path (Join-Path $staging $name) -Value $content -Encoding UTF8
}

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$usePyInstaller = (-not $SourceOnly) -and (Test-Path $venvPython)

if ($usePyInstaller) {
    Write-Host "Building $exeName with PyInstaller..."
    Push-Location $root
    try {
        & $venvPython -m PyInstaller --noconfirm --clean `
            --name optigo-face-agent `
            --onedir `
            --console `
            --hidden-import agent.config `
            --hidden-import agent.camera `
            --hidden-import agent.recognizer `
            main.py
        if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }

        $pyiOut = Join-Path $root "dist\optigo-face-agent"
        if (-not (Test-Path (Join-Path $pyiOut $exeName))) {
            throw "PyInstaller output not found"
        }

        Copy-Item $pyiOut\* $staging -Recurse -Force
        Copy-Item (Join-Path $root "config.example.json") $staging -Force
        Copy-Item (Join-Path $root "HUONG-DAN.txt") $staging -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $root "_env.bat") $staging -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $root "_ensure_console.bat") $staging -Force -ErrorAction SilentlyContinue

        Write-DistBat "chay-agent.bat" "run"
        Write-DistBat "ghep-noi.bat" "pair"
        Write-DistBat "dang-ky-khuon-mat.bat" "enroll"
        Write-DistBat "cau-hinh-camera.bat" "camera-doctor"

        # Không copy thư mục agent/*.py — chỉ exe + deps
        Get-ChildItem $staging -Recurse -Include "*.py" -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '\\site-packages\\' } |
            ForEach-Object { Remove-Item $_.FullName -Force }

        Write-Host "PyInstaller build OK (no plain agent source in zip)."
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Warning "PyInstaller not available — packaging source bundle (dev fallback)."
    $include = @(
        "agent", "main.py", "requirements.txt", "config.example.json",
        "optigo-setup.bat", "giao-dien-cai-dat.bat", "cai-dat.bat",
        "cau-hinh-camera.bat", "chay-agent.bat", "ghep-noi.bat",
        "dang-ky-khuon-mat.bat", "_env.bat", "_ensure_console.bat",
        "HUONG-DAN.txt", "README.md"
    )
    foreach ($item in $include) {
        $src = Join-Path $root $item
        if (-not (Test-Path $src)) { Write-Error "Missing: $src" }
        Copy-Item $src -Destination $staging -Recurse -Force
    }
    Get-ChildItem $staging -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
}

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -Force
Remove-Item $staging -Recurse -Force

New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
Copy-Item $zipPath -Destination $privateZipPath -Force

if (Test-Path $publicZipPath) {
    Remove-Item $publicZipPath -Force
    Write-Host "Removed public copy: $publicZipPath"
}

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Created: $zipPath ($sizeMb MB)"
Write-Host "Private path: $privateZipPath"
Write-Host "Download via authenticated API: GET /api/face-devices/download-agent"
