param(
    [string]$SourcePath
)

$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetDir = Join-Path $appRoot "bin"
$targetPath = Join-Path $targetDir "ojreviewd.exe"

$candidates = @()

if ($SourcePath) {
    $candidates += $SourcePath
}

if ($env:OJREVIEW_SERVICE_PATH) {
    $candidates += $env:OJREVIEW_SERVICE_PATH
}

$candidates += @(
    (Join-Path $appRoot "..\desktop\OJReviewDesktop\bin\Debug\net9.0-windows10.0.19041.0\ojreviewd.exe"),
    (Join-Path $appRoot "..\server\bin\ojreviewd.exe")
)

$resolvedSource = $null
foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
        continue
    }

    $fullPath = [System.IO.Path]::GetFullPath($candidate)
    if (Test-Path $fullPath) {
        $resolvedSource = $fullPath
        break
    }
}

if (-not $resolvedSource) {
    Write-Error "Could not find ojreviewd.exe. Pass -SourcePath or set OJREVIEW_SERVICE_PATH."
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Force $resolvedSource $targetPath

Write-Host "Prepared local service binary:"
Write-Host "  Source: $resolvedSource"
Write-Host "  Target: $targetPath"
