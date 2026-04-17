# BlockPulse probe — one-liner installer for Windows PowerShell
# Usage: irm https://blockpulse.ru/probe/install.ps1 | iex
$ErrorActionPreference = "Stop"

$API = "__API_URL__"

Write-Host "`n  ⚡ BlockPulse Probe" -ForegroundColor Cyan
Write-Host "  Checking your VPN protocol accessibility...`n" -ForegroundColor DarkGray

# Check Python
$python = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd -c "import sys; print(sys.version_info.major)" 2>$null
        if ($ver -ge 3) {
            $python = $cmd
            break
        }
    } catch {}
}

if (-not $python) {
    Write-Host "  Python 3 not found. Installing..." -ForegroundColor Yellow

    # Try winget first
    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($hasWinget) {
        Write-Host "  Installing Python via winget..." -ForegroundColor DarkGray
        winget install Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent 2>$null
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $python = "python"
    } else {
        # Direct download
        Write-Host "  Downloading Python installer..." -ForegroundColor DarkGray
        $installer = "$env:TEMP\python-installer.exe"
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe" -OutFile $installer
        Start-Process -Wait -FilePath $installer -ArgumentList "/quiet", "InstallAllUsers=0", "PrependPath=1"
        Remove-Item $installer -Force
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $python = "python"
    }

    # Verify
    try {
        $ver = & $python --version 2>&1
        Write-Host "  ✓ $ver installed" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Failed to install Python. Please install Python 3.8+ from python.org" -ForegroundColor Red
        exit 1
    }
}

$pyVer = & $python --version 2>&1
Write-Host "  Using: $pyVer" -ForegroundColor DarkGray
Write-Host ""

# Download and run probe
$tmpFile = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.py'
try {
    Invoke-WebRequest -Uri "$API/probe.py" -OutFile $tmpFile -UseBasicParsing
} catch {
    Write-Host "  ✗ Failed to download probe script" -ForegroundColor Red
    exit 1
}

& $python $tmpFile
$exitCode = $LASTEXITCODE
Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "  ✓ Probe complete! Results sent to BlockPulse." -ForegroundColor Green
    Write-Host "  Dashboard: $API`n" -ForegroundColor DarkGray
} else {
    Write-Host "  ✗ Probe failed (exit code: $exitCode)" -ForegroundColor Red
}
