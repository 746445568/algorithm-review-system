# 🚀 OJ Review Desktop - 快速启动指南

## 最简单的运行方式

### 方法一：一键启动（推荐）

在 Windows PowerShell 中运行：

```powershell
# 方式 1: 使用 PowerShell 脚本
.\start-app.ps1

# 方式 2: 使用批处理脚本
.\start-app.bat
```

这会自动：
1. ✅ 构建 Go 后端
2. ✅ 启动后端服务
3. ✅ 启动 WinUI 前端
4. ✅ 前端关闭时自动清理后端

---

## 手动分步运行

### Step 1: 构建后端

**在 Windows PowerShell 中**（不是 WSL）：

```powershell
# 进入后端目录
cd apps\server

# 构建
go mod tidy
go build -o ojreviewd.exe .\cmd\ojreviewd

# 返回根目录
cd ..\..
```

### Step 2: 运行后端

```powershell
.\ojreviewd.exe
```

你会看到：
```
2024/03/13 17:00:00 ojreviewd listening on http://127.0.0.1:38473
```

### Step 3: 运行前端

**在新的 PowerShell 窗口中**：

```powershell
cd apps\desktop\OJReviewDesktop
dotnet run
```

---

## 完整构建（生成可执行文件）

```powershell
# 构建后端和前端，输出到 dist 目录
.\build-all.ps1

# 运行构建后的版本
cd dist
.\start-app.bat
```

---

## 📋 环境要求

| 组件 | 版本 | 下载 |
|------|------|------|
| Windows | 10/11 | - |
| Go | 1.21+ | https://go.dev/dl/ |
| .NET SDK | 9.0 | https://dotnet.microsoft.com/download |
| Windows App SDK | 1.5+ | 随 VS 2022 安装 |

---

## 🔧 API 测试

后端启动后，测试 API：

```powershell
# 健康检查
Invoke-WebRequest -Uri "http://127.0.0.1:38473/health" -UseBasicParsing

# 或浏览器访问：
# http://127.0.0.1:38473/health
# http://127.0.0.1:38473/api/me
# http://127.0.0.1:38473/api/review/summary
```

---

## 📝 可用脚本

| 脚本 | 用途 |
|------|------|
| `start-app.ps1` | PowerShell 一键启动 |
| `start-app.bat` | CMD 一键启动 |
| `build-all.ps1` | 完整构建 |
| `RUN.md` | 详细运行文档 |

---

## ❓ 常见问题

### Q: 在 WSL 中运行 go build 报错？
**A**: 在 Windows PowerShell 中运行，不要用 WSL

### Q: dotnet 命令找不到？
**A**: 安装 .NET 9 SDK: https://dotnet.microsoft.com/download

### Q: 端口 38473 被占用？
**A**: 
```powershell
# 查看占用进程
netstat -ano | findstr 38473

# 关闭占用进程
taskkill /PID <进程ID> /F
```

### Q: 前端显示"无法连接服务"？
**A**: 确保后端已启动，检查防火墙是否阻止 38473 端口

---

## 🎯 功能验证

启动后，你可以：

1. **绑定 Codeforces 账号**
   - 在 Accounts 页面输入 Codeforces handle
   - 点击同步按钮

2. **查看错题本**
   - Review 页面会显示薄弱标签
   - 重复失败的题目
   - 最近未解决的题目

3. **配置 AI**
   - Settings > AI 页面配置 OpenAI/DeepSeek/Ollama
   - 生成智能分析

