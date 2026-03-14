# OJ Review Desktop - 运行指南

## 方法一：快速运行（推荐）

### 1. 构建 Go 后端

```bash
# 进入项目根目录
cd algorithm-review-system

# 设置 Go 环境（如果需要在 WSL 中运行）
export GOPROXY=https://goproxy.cn,direct

# 构建 Go 服务
cd apps/server
go mod tidy
go build -o ojreviewd.exe ./cmd/ojreviewd

# 运行 Go 服务
./ojreviewd.exe
```

### 2. 运行 WinUI 前端

```bash
# 在 Windows PowerShell 中（不是 WSL）
cd apps\desktop\OJReviewDesktop

# 构建并运行
dotnet run

# 或者直接运行已构建的版本
dotnet build
cd bin\Debug\net9.0-windows10.0.19041.0
.\OJReviewDesktop.exe
```

---

## 方法二：完整开发环境

### 环境要求

- Windows 10/11
- Go 1.21+
- .NET 9 SDK
- Windows App SDK
- Visual Studio 2022 或 VS Code

### 步骤 1：构建后端（WSL 或 Windows）

```bash
# 在 WSL 中
cd ~/algorithm-review-system/apps/server

# 下载依赖
go mod download

# 构建 Windows 可执行文件（在 Windows 上运行 Go 服务）
GOOS=windows GOARCH=amd64 go build -o ../../ojreviewd.exe ./cmd/ojreviewd

# 或者在 Windows PowerShell 中
cd apps\server
go build -o ..\..\ojreviewd.exe .\cmd\ojreviewd
```

### 步骤 2：运行后端

```powershell
# PowerShell
.\ojreviewd.exe

# 服务将在 http://127.0.0.1:38473 启动
```

### 步骤 3：构建前端

```powershell
# 在 Windows PowerShell 中
cd apps\desktop\OJReviewDesktop

# 还原 NuGet 包
dotnet restore

# 构建
dotnet build

# 运行
dotnet run
```

---

## 方法三：使用脚本自动运行

### Windows PowerShell 脚本 (start-app.ps1)

```powershell
# 启动后端
$backend = Start-Process -FilePath ".\ojreviewd.exe" -WindowStyle Hidden -PassThru

# 等待后端启动
Start-Sleep -Seconds 3

# 启动前端
cd apps\desktop\OJReviewDesktop
dotnet run

# 前端关闭后，结束后端
Stop-Process -Id $backend.Id -Force
```

### 批处理脚本 (start-app.bat)

```batch
@echo off
echo Starting OJ Review Desktop...

:: 启动后端（后台）
start /B ojreviewd.exe

timeout /t 3 /nobreak > nul

:: 启动前端
cd apps\desktop\OJReviewDesktop
dotnet run

:: 关闭后端
taskkill /F /IM ojreviewd.exe > nul 2>&1
```

---

## API 测试

服务启动后，测试 API：

```bash
# 健康检查
curl http://127.0.0.1:38473/health

# 获取当前用户
curl http://127.0.0.1:38473/api/me

# 获取账号列表
curl http://127.0.0.1:38473/api/accounts

# 获取错题本摘要
curl http://127.0.0.1:38473/api/review/summary
```

---

## 常见问题

### 1. Go 构建失败（WSL 路径问题）

**问题**: `go: RLock ... Incorrect function`

**解决**: 在 Windows PowerShell 中构建，不是在 WSL：
```powershell
cd apps\server
go build -o ojreviewd.exe .\cmd\ojreviewd
```

### 2. WinUI 构建失败

**问题**: 缺少 Windows App SDK

**解决**: 安装 Windows App SDK 或 Visual Studio 2022 的"使用 C++ 的桌面开发"工作负载

### 3. 端口被占用

**解决**: 修改 `apps/server/internal/app/config.go` 中的默认端口，或关闭占用 38473 的程序

### 4. 数据库权限错误

**解决**: 确保 `%APPDATA%\OJReviewDesktop\data` 目录可写

