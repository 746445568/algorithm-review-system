# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# OJ 错题复盘系统 — CLAUDE.md

## 项目简介

面向算法竞赛爱好者的错题复盘工具，支持从 Codeforces/AtCoder 同步提交记录，对错误提交进行 AI 分析，并通过间隔重复算法安排复习计划。

**当前维护：桌面版（Electron + Go）**
- 单机离线，Electron Shell + React/Vite 渲染层 + Go 二进制服务（`ojreviewd`）
- Web 版（Next.js + Express + Prisma）已废弃，`backend/`、`frontend/` 目录仅作历史参考

---

## 技术栈

| 层 | 技术 |
|---|---|
| 渲染层 | React 19, Vite 7（JSX，无 TypeScript） |
| 主进程 | Electron 37，纯 ESM（`.mjs`） |
| 后端服务 | Go 1.26，`ojreviewd` 二进制，端口 38473 |
| 数据库 | SQLite，Go 直连（无 ORM） |
| OJ 集成 | Codeforces API、AtCoder API |
| AI 分析 | OpenAI 兼容接口（`LLM_API_BASE` 可自定义） |
| 进程管理 | Electron 子进程管理（ServiceManager） |

---

## 目录结构

```
apps/
├── desktop-electron/           # Electron 桌面端（主线）
│   ├── main/index.mjs          # Electron 主进程，ServiceManager
│   ├── preload/index.mjs       # contextBridge 暴露 desktopBridge API
│   ├── renderer/src/           # React UI（JSX）
│   │   ├── App.jsx             # 根组件，主题/路由/服务状态
│   │   ├── pages/              # Dashboard/Accounts/Review/Settings/Analysis/Statistics
│   │   ├── components/         # 可复用组件
│   │   ├── hooks/              # useOfflineData, useReviewFilters 等
│   │   └── lib/                # api.js, db.js, sync.js, NavigationContext
│   ├── test/                   # Node.js 测试（*.test.mjs）
│   ├── scripts/                # dev.mjs, build.mjs, start-static.mjs
│   └── bin/ojreviewd.exe       # Go 服务二进制
├── server/                     # Go 后端服务源码（ojreviewd）
│   ├── cmd/ojreviewd/main.go   # 入口
│   └── internal/
│       ├── api/server.go       # REST API 路由
│       ├── adapters/           # OJ/AI 集成适配器
│       ├── storage/sqlite.go   # SQLite 数据层
│       ├── jobs/queue.go       # 异步任务队列
│       ├── srs/sm2.go          # 间隔重复算法
│       └── models/types.go     # 数据类型定义
├── backend/                    # 历史遗留 Web 后端（不维护）
└── frontend/                   # 历史遗留 Web 前端（不维护）
```

---

## 常用命令

### 桌面端开发
```bash
cd apps/desktop-electron
npm install
npm run dev               # 启动 Vite 渲染器 + Electron（含 Go 服务）
npm run dev:renderer      # 仅启动 Vite 渲染器（浏览器调试用，端口 5180）
npm run build             # 构建渲染器 + 打包 Electron
npm run dist              # 生成 Windows 安装包（NSIS）
```

### Go 服务
```bash
cd apps/server
go run ./cmd/ojreviewd    # 本地运行（开发时 Electron 会自动回退到此命令）
go build -o ../desktop-electron/bin/ojreviewd.exe ./cmd/ojreviewd
go test ./...             # 运行所有 Go 测试
go test ./internal/api -v # 运行特定包的测试
```

### 渲染层测试
```bash
cd apps/desktop-electron
node --test test/*.mjs    # 运行所有 Node.js 测试
node --test test/http.test.mjs  # 运行单个测试文件
```

---

## 数据模型（Go native）

核心类型定义在 `apps/server/internal/models/types.go`：

```
OwnerProfile → PlatformAccount（OJ 账号绑定）
            → Problem → Submission → ProblemReviewState（复习状态）
            → AnalysisTask（AI 分析任务）
            → SyncTask（同步任务）
            → ProblemChat（题目对话记录）
            → Contest（比赛信息）
            → Goal（目标设定）
```

关键枚举：
- `Platform`: CODEFORCES / ATCODER / MANUAL
- `Verdict`: AC / WA / TLE / MLE / RE / CE / OLE / IE / UNKNOWN
- `ReviewStatus`: TODO / REVIEWING / SCHEDULED / DONE
- `TaskStatus`: PENDING / RUNNING / SUCCESS / FAILED / PARTIAL_SUCCESS / CANCELLED

---

## 架构关键点

### Electron 桌面端通信链路
```
renderer (React)
  └─ window.desktopBridge.*        ← contextBridge API（preload 暴露）
       └─ ipcMain.handle(...)      ← Electron 主进程 IPC
            └─ ServiceManager      ← 管理 ojreviewd Go 进程
                 └─ http://127.0.0.1:38473  ← Go 服务 REST API
```

Go 进程启动来源：
1. `OJREVIEW_SERVICE_PATH` 环境变量指定的二进制
2. Electron 打包资源目录或 `apps/desktop-electron/bin/ojreviewd.exe`
3. 开发态回退 `go run ./cmd/ojreviewd`

### 浏览器调试模式（无 Electron）
- 当 `window.desktopBridge` 不存在时自动进入浏览器调试模式
- Vite 渲染器先尝试代理 `/health`，失败后直连 `http://127.0.0.1:38473`
- Go 服务已内置 CORS 中间件，允许跨域请求

### 适配器模式（Adapter Pattern）
```
judges.Adapter interface:
  - ValidateAccount(handle) → 验证账号有效性
  - FetchSubmissions(handle, cursor) → 拉取提交记录
  - FetchProblemMetadata(problemID) → 获取题目元数据
  - FetchProfile(handle) → 获取用户评分信息
  - FetchStatement(problemID) → 获取题目原文
  - FetchEditorial(problemID) → 获取题解

ai.Provider interface:
  - ValidateConfig(Settings) → 验证 AI 配置
  - Analyze(input, settings) → 执行 AI 分析
```

实现：`judges/codeforces.go`, `judges/atcoder.go`, `ai/openai.go`, `ai/deepseek.go`, `ai/ollama.go`

### 离线缓存策略（渲染层）
- `lib/db.js`：IndexedDB 封装，本地持久化
- `lib/sync.js`：同步逻辑，后台 5 分钟轮询
- `api.js` 的 `saveReviewState` 先写本地缓存，再尝试同步到 Go 服务

### 主题系统
- 三种模式：`light` / `dark` / `follow-system`
- 存储在 localStorage("ojreview-theme")
- 通过 `data-theme="dark"` 属性 + CSS 变量切换

---

## 代码规范

### 通用
- **提交信息**：用中文，格式 `类型: 描述`（如 `feat: 添加 AI 分析按钮`）
- **错误处理**：Go 统一返回 `{ "error": "message" }` JSON

### Go 服务（ojreviewd）
- REST API 路径：`/api/*`（参考 `internal/api/server.go`）
- 健康检查：`GET /health` 返回 `{ "status": "ok", "firstRun": bool }`
- 数据库操作集中在 `storage/sqlite.go`，不散落在 handlers
- 测试使用 `httptest` 包模拟 HTTP 请求（参考 `health_test.go`）

### Electron 渲染层（JSX）
- 组件放 `pages/` 或 `components/`
- 状态管理：本地 useState + useCallback，不引入外部状态库
- API 调用统一通过 `lib/api.js` 的 `api` 对象
- `window.desktopBridge` 在调用前需判断是否存在（浏览器调试模式下不存在）
- **页面导航**：使用 `lib/NavigationContext.jsx` 的 `useNavigation()` hook
- **AI 分析异步任务**：轮询 `api.getAnalysisTask(id)` 直到 `status === "SUCCESS" | "FAILED"`

### 测试
- Go 测试：标准 `testing` 包，命名 `*_test.go`，放同目录
- Node 测试：`node --test` 内置测试框架，命名 `*.test.mjs`