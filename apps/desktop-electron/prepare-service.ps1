param(
    [string]$SourcePath
)

$ErrorActionPreference = "Stop"

function Get-MajorVersion([string]$versionText) {
    if ([string]::IsNullOrWhiteSpace($versionText)) {
        return $null
    }

    $normalized = $versionText.Trim()
    if ($normalized.StartsWith("v")) {
        $normalized = $normalized.Substring(1)
    }

    $parts = $normalized.Split('.')
    if ($parts.Count -eq 0) {
        return $null
    }

    $majorValue = 0
    if ([int]::TryParse($parts[0], [ref]$majorValue)) {
        return $majorValue
    }

    return $null
}

function Get-ServiceVersion([string]$binaryPath) {
    $jsonOutput = $null
    try {
        $jsonOutput = & $binaryPath --version-json 2>$null
    }
    catch {
        $jsonOutput = $null
    }

    if ($jsonOutput) {
        try {
            $parsed = $jsonOutput | ConvertFrom-Json
            if ($parsed.version) {
                return [string]$parsed.version
            }
        }
        catch {
            # Fall through to plain text parsing.
        }
    }

    $plainOutput = $null
    try {
        $plainOutput = & $binaryPath --version 2>$null
    }
    catch {
        $plainOutput = $null
    }

    if (-not $plainOutput) {
        return $null
    }

    $match = [regex]::Match(($plainOutput -join " "), "ojreviewd\s+([0-9A-Za-z._+-]+)")
    if ($match.Success) {
        return $match.Groups[1].Value
    }

    return $null
}

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetDir = Join-Path $appRoot "bin"
$targetPath = Join-Path $targetDir "ojreviewd.exe"
$packageJsonPath = Join-Path $appRoot "package.json"

if (-not (Test-Path $packageJsonPath)) {
    Write-Error "Cannot find desktop package.json at: $packageJsonPath"
}

$desktopPackage = Get-Content -Raw $packageJsonPath | ConvertFrom-Json
$desktopVersion = [string]$desktopPackage.version
$desktopMajor = Get-MajorVersion $desktopVersion
if ($null -eq $desktopMajor) {
    Write-Error "Cannot parse desktop major version from package.json version '$desktopVersion'."
}

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

if (-not (Test-Path $resolvedSource -PathType Leaf)) {
    Write-Error "Resolved source is not a file: $resolvedSource"
}

$serviceVersion = Get-ServiceVersion $resolvedSource
if (-not $serviceVersion) {
    Write-Error @"
Failed to read version from '$resolvedSource'.
Please rebuild service with injected build info, e.g.:
  pwsh ./apps/server/scripts/build-service.ps1
"@
}

$serviceMajor = Get-MajorVersion $serviceVersion
if ($null -eq $serviceMajor) {
    Write-Error "Cannot parse service major version from '$serviceVersion' in '$resolvedSource'."
}

if ($serviceMajor -ne $desktopMajor) {
    Write-Error @"
Version mismatch: desktop major=$desktopMajor (version=$desktopVersion), service major=$serviceMajor (version=$serviceVersion).
Please rebuild and replace ojreviewd before packaging:
  pwsh ./apps/server/scripts/build-service.ps1
  .\apps\desktop-electron\prepare-service.ps1 -SourcePath .\apps\server\bin\ojreviewd.exe
"@
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Force $resolvedSource $targetPath

Write-Host "Prepared local service binary:"
Write-Host "  Source: $resolvedSource"
Write-Host "  Target: $targetPath"
Write-Host "  Service Version: $serviceVersion"
Write-Host "  Desktop Version: $desktopVersion"
