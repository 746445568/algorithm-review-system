# OJ Review Desktop - 运行指南

## 方法一：开发模式（推荐）

### 1. 安装依赖

```bash
cd apps/desktop-electron
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

这会自动：
- 启动 Vite 开发服务器
- 启动 Electron 窗口
- 自动拉起 Go 后端服务（如果需要）

---

## 方法二：静态启动

如果开发模式遇到 WSL 路径问题，使用静态启动：

### Windows PowerShell

```powershell
cd apps\desktop-electron
npm run start:static
```

### Windows CMD

```cmd
apps\desktop-electron\run-static.cmd
```

### 静态启动流程

1. 构建渲染器 (`npm run build:renderer`)
2. 启动 Electron 加载静态文件

---

## 方法三：完整构建

### 环境要求

- Windows 10/11
- Node.js 20+
- Go 1.21+

### 步骤 1：构建 Go 服务

```powershell
cd apps\server
go mod tidy
go build -o bin\ojreviewd.exe .\cmd\ojreviewd
```

### 步骤 2：准备服务路径

```powershell
cd ..\desktop-electron
.\prepare-service.ps1
```

### 步骤 3：构建 Electron

```bash
npm run build
```

---

## 开发脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（Vite + Electron） |
| `npm run dev:renderer` | 仅启动 Vite 开发服务器 |
| `npm run start:static` | 静态模式启动 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动已构建版本 |

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
```

---

## 常见问题

### 1. Vite 文件监听失败（WSL 路径问题）

**问题**: 在 `\\wsl.localhost\...` 路径下，Vite 文件监听可能失败

**解决**: 使用静态启动模式：
```powershell
npm run start:static
```

### 2. Go 服务启动失败

**问题**: Electron 无法启动 Go 服务

**解决**: 手动构建并准备服务：
```powershell
cd apps\server
go build -o bin\ojreviewd.exe .\cmd\ojreviewd
cd ..\desktop-electron
.\prepare-service.ps1
```

### 3. 端口被占用

**解决**: 关闭占用 38473 的程序：
```powershell
netstat -ano | findstr 38473
taskkill /PID <进程ID> /F
```

### 4. 数据库权限错误

**解决**: 确保 `%APPDATA%\OJReviewDesktop\data` 目录可写

### 5. PowerShell 避免使用 npm.cmd

**问题**: 在 `\\wsl.localhost\...` 路径下，PowerShell 运行 npm.cmd 可能有问题

**解决**: 直接使用 node：
```powershell
node .\scripts\dev.mjs
```