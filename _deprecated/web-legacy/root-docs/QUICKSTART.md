# OJ Review Desktop - 快速启动指南

## 最简单的运行方式

### 方法一：开发模式（推荐）

在项目根目录运行：

```powershell
cd apps\desktop-electron
npm install
npm run dev
```

这会自动：
1. 启动 Vite 开发服务器
2. 启动 Electron 窗口
3. 自动拉起 Go 后端服务

---

### 方法二：静态启动

如果开发模式遇到问题（如 WSL 路径问题），使用静态启动：

```powershell
cd apps\desktop-electron
npm install
npm run start:static
```

或在 Windows CMD 中：

```cmd
apps\desktop-electron\run-static.cmd
```

---

## 手动分步运行

### Step 1: 准备 Go 服务

**在 Windows PowerShell 中**：

```powershell
cd apps\server
go mod tidy
go build -o bin\ojreviewd.exe .\cmd\ojreviewd
```

### Step 2: 准备 Electron 服务路径

```powershell
cd ..\desktop-electron
.\prepare-service.ps1
```

### Step 3: 启动 Electron

```powershell
npm run dev
```

---

## 环境要求

| 组件 | 版本 | 下载 |
|------|------|------|
| Windows | 10/11 | - |
| Node.js | 20+ | https://nodejs.org/ |
| Go | 1.21+ | https://go.dev/dl/ |

---

## API 测试

后端启动后，测试 API：

```powershell
# 健康检查
Invoke-WebRequest -Uri "http://127.0.0.1:38473/health" -UseBasicParsing

# 或浏览器访问：
# http://127.0.0.1:38473/health
# http://127.0.0.1:38473/api/me
# http://127.0.0.1:38473/api/accounts
```

---

## 可用脚本

| 脚本 | 用途 |
|------|------|
| `npm run dev` | 开发模式启动 |
| `npm run start:static` | 静态模式启动 |
| `npm run build` | 构建生产版本 |
| `run-static.cmd` | Windows CMD 静态启动 |

---

## 常见问题

### Q: 在 WSL 路径下 Vite 文件监听失败？

**A**: 使用静态启动模式：

```powershell
npm run start:static
```

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

### Q: Go 服务启动失败？

**A**: 检查 Go 环境是否正确安装：

```powershell
go version
```

---

## 功能验证

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