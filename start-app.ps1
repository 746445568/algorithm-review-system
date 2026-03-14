param(
    [switch]$BuildBackend,
    [switch]$BuildFrontend,
    [switch]$NoFrontend
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptRoot

function Write-Status($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

function Convert-UncToLinuxPath([string]$uncPath) {
    # Example:
    # \wsl.localhost\MyWSL\home\user\repo -> /home/user/repo
    $linux = $uncPath -replace '^\\wsl\.localhost\[^\]+', ''
    $linux = $linux -replace '\', '/'
    if (-not $linux.StartsWith('/')) { $linux = '/' + $linux }
    return $linux
}

Write-Status "=== OJ Review Desktop Launcher ==="
Write-Status "Working dir: $ScriptRoot"

if (-not (Test-Path "apps\server\cmd\ojreviewd")) {
    Write-Err "Project root not detected."
    exit 1
}

$useWslBuild = $ScriptRoot.StartsWith('\wsl.localhost\')

if ($BuildBackend -or -not (Test-Path "ojreviewd.exe")) {
    Write-Status "[1/4] Building backend..."

    if ($useWslBuild) {
        Write-Status "UNC path detected, building backend via WSL..."
        $linuxRoot = Convert-UncToLinuxPath $ScriptRoot

        $cmd = "cd \"$linuxRoot/apps/server\" && go mod tidy && GOOS=windows GOARCH=amd64 go build -o \"$linuxRoot/ojreviewd.exe\" ./cmd/ojreviewd"
        wsl.exe -d MyWSL bash -lc $cmd

        if ($LASTEXITCODE -ne 0) {
            Write-Err "Backend build failed in WSL."
            exit 1
        }
    }
    else {
        Set-Location "apps\server"
        go mod tidy
        go build -o "..\..\ojreviewd.exe" ".\cmd\ojreviewd"
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Backend build failed."
            exit 1
        }
        Set-Location $ScriptRoot
    }

    Write-Ok "Backend build OK"
}
else {
    Write-Status "[1/4] Reusing existing ojreviewd.exe"
}

Write-Status "[2/4] Starting backend..."
$backend = Start-Process -FilePath ".\ojreviewd.exe" -WindowStyle Hidden -PassThru -RedirectStandardOutput ".\backend.log" -RedirectStandardError ".\backend.err"
Start-Sleep -Seconds 3

try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:38473/health" -UseBasicParsing -TimeoutSec 5
    if ($health.StatusCode -ne 200) { throw "health check failed" }
    Write-Ok "Backend is healthy"
}
catch {
    Write-Err "Backend failed to start. Check backend.err"
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

if ($BuildFrontend) {
    Write-Status "[3/4] Building frontend..."
    Set-Location "apps\desktop\OJReviewDesktop"
    dotnet restore
    dotnet build
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Frontend build failed."
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
        exit 1
    }
    Set-Location $ScriptRoot
    Write-Ok "Frontend build OK"
}

if ($NoFrontend) {
    Write-Status "[4/4] Frontend skipped. Backend only mode."
    Write-Ok "API: http://127.0.0.1:38473"
    Write-Status "Press Ctrl+C to stop."
    try {
        while ($true) { Start-Sleep -Seconds 1 }
    }
    finally {
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    }
}
else {
    Write-Status "[4/4] Starting frontend..."
    Set-Location "apps\desktop\OJReviewDesktop"
    try {
        dotnet run
    }
    finally {
        Set-Location $ScriptRoot
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
        Write-Ok "Stopped backend"
    }
}
