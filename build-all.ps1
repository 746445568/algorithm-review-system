# OJ Review Desktop 完整构建脚本 (PowerShell)
# 构建后端和前端，生成可执行文件

param(
    [string]$Configuration = "Release",
    [string]$OutputDir = ".\dist"
)

$ErrorActionPreference = "Stop"

function Write-Color($Text, $Color = "White") {
    Write-Host $Text -ForegroundColor $Color
}

Write-Color "========================================" "Cyan"
Write-Color "   OJ Review Desktop 构建脚本" "Cyan"
Write-Color "========================================" "Cyan"
Write-Host ""

# 创建输出目录
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# 构建后端
Write-Color "[1/3] 构建 Go 后端..." "Yellow"
cd apps\server

go mod tidy
if ($LASTEXITCODE -ne 0) {
    Write-Color "✗ go mod tidy 失败" "Red"
    exit 1
}

$env:GOOS = "windows"
$env:GOARCH = "amd64"
go build -ldflags="-s -w" -o ..\..\$OutputDir\ojreviewd.exe .\cmd\ojreviewd

if ($LASTEXITCODE -ne 0) {
    Write-Color "✗ 后端构建失败" "Red"
    exit 1
}

cd ..\..
Write-Color "✓ 后端构建成功" "Green"

# 构建前端
Write-Color "[2/3] 构建 WinUI 前端 ($Configuration)..." "Yellow"
cd apps\desktop\OJReviewDesktop

dotnet restore
if ($LASTEXITCODE -ne 0) {
    Write-Color "✗ 依赖还原失败" "Red"
    exit 1
}

dotnet build -c $Configuration
if ($LASTEXITCODE -ne 0) {
    Write-Color "✗ 前端构建失败" "Red"
    exit 1
}

# 复制前端输出到 dist
$frontendSource = "bin\$Configuration\net9.0-windows10.0.19041.0"
Copy-Item -Path $frontendSource\* -Destination ..\..\..\$OutputDir -Recurse -Force

cd ..\..\..
Write-Color "✓ 前端构建成功" "Green"

# 复制额外文件
Write-Color "[3/3] 复制资源文件..." "Yellow"
Copy-Item -Path "RUN.md" -Destination $OutputDir -Force
Copy-Item -Path "start-app.bat" -Destination $OutputDir -Force

Write-Color "✓ 构建完成！" "Green"
Write-Host ""
Write-Color "输出目录: $OutputDir" "Cyan"
Write-Color "可执行文件:" "Cyan"
Write-Color "  - $OutputDir\OJReviewDesktop.exe (前端)" "White"
Write-Color "  - $OutputDir\ojreviewd.exe (后端)" "White"
Write-Host ""
Write-Color "运行方式:" "Cyan"
Write-Color "  1. 双击 $OutputDir\start-app.bat" "White"
Write-Color "  2. 或先运行 ojreviewd.exe，再运行 OJReviewDesktop.exe" "White"
