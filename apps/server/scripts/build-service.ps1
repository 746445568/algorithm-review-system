param(
    [string]$Version,
    [string]$Commit,
    [string]$GOOS,
    [string]$GOARCH
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverRoot = Resolve-Path (Join-Path $scriptDir "..")
$outDir = Join-Path $serverRoot "bin"
$outPath = Join-Path $outDir "ojreviewd.exe"

if (-not $Version) {
    try {
        $Version = (git -C $serverRoot describe --tags --always --dirty).Trim()
    }
    catch {
        $Version = "1.0.0-dev"
    }
}

if (-not $Commit) {
    try {
        $Commit = (git -C $serverRoot rev-parse --short HEAD).Trim()
    }
    catch {
        $Commit = "dev"
    }
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$ldflags = "-X ojreviewdesktop/internal/buildinfo.Version=$Version -X ojreviewdesktop/internal/buildinfo.Commit=$Commit"
$arguments = @("build", "-ldflags", $ldflags, "-o", $outPath, "./cmd/ojreviewd")

Write-Host "[build-service] version=$Version commit=$Commit"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "go"
$psi.WorkingDirectory = $serverRoot
$psi.RedirectStandardError = $false
$psi.RedirectStandardOutput = $false
$psi.UseShellExecute = $true

if ($GOOS) {
    $psi.EnvironmentVariables["GOOS"] = $GOOS
}
if ($GOARCH) {
    $psi.EnvironmentVariables["GOARCH"] = $GOARCH
}

foreach ($arg in $arguments) {
    [void]$psi.ArgumentList.Add($arg)
}

$process = [System.Diagnostics.Process]::Start($psi)
$process.WaitForExit()
if ($process.ExitCode -ne 0) {
    throw "go build failed with exit code $($process.ExitCode)"
}

Write-Host "[build-service] built $outPath"
