@echo off
chcp 65001 > nul
title OJ Review Desktop 启动器

echo ========================================
echo    OJ Review Desktop 启动器
echo ========================================
echo.

:: 检查是否在正确目录
if not exist "apps\server\cmd\ojreviewd" (
    echo [错误] 请在项目根目录运行此脚本
    pause
    exit /b 1
)

:: 构建后端（如果不存在）
if not exist "ojreviewd.exe" (
    echo [1/4] 构建 Go 后端...
    cd apps\server
    go mod tidy
    go build -o ..\..\ojreviewd.exe .\cmd\ojreviewd
    if errorlevel 1 (
        echo [错误] 后端构建失败！
        pause
        exit /b 1
    )
    cd ..\..
    echo [✓] 后端构建成功
) else (
    echo [1/4] 使用已存在的 ojreviewd.exe
)

:: 启动后端
echo [2/4] 启动后端服务...
start /B ojreviewd.exe > backend.log 2>&1

:: 等待后端启动
timeout /t 3 /nobreak > nul

:: 检查后端是否运行
curl -s http://127.0.0.1:38473/health > nul
if errorlevel 1 (
    echo [✗] 后端启动失败，查看 backend.log
    taskkill /F /IM ojreviewd.exe > nul 2>&1
    pause
    exit /b 1
)
echo [✓] 后端服务已启动

:: 启动前端
echo [3/4] 启动 WinUI 前端...
echo [4/4] 应用正在运行...
echo ========================================
echo    关闭窗口将停止所有服务
echo ========================================
echo.

cd apps\desktop\OJReviewDesktop
dotnet run

:: 前端关闭后，结束后端
cd ..\..\..
echo.
echo 正在关闭后端服务...
taskkill /F /IM ojreviewd.exe > nul 2>&1
echo [✓] 已清理所有进程
echo.
pause
