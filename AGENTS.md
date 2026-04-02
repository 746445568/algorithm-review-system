# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

# OJ 错题复盘系统 — AGENTS.md

## 项目简介

面向算法竞赛爱好者的错题复盘工具，支持从 Codeforces 同步提交记录，对错误提交进行 AI 分析，并通过间隔重复算法安排复习计划。

两条并行产品线：
- **Web 版**：多人共享，部署在服务器，Next.js 前端 + Express 后端
- **桌面版（主线）**：单机离线，Electron Shell + React/Vite 渲染层 + Go 二进制服务（`ojreviewd`）

---

## 技术栈

| 层 | 技术 |
|---|---|
| Web 前端 | Next.js 14, React, Tailwind CSS, TypeScript |
| Web 后端 | Express 4, TypeScript, Prisma ORM, SQLite |
| 桌面渲染层 | React 19, Vite 7（无 TypeScript，用 JSX） |
| 桌面主进程 | Electron 37，纯 ESM（`.mjs`） |
| 桌面后端服务 | Go 1.26，`ojreviewd` 二进制，端口 38473 |
| 数据库 | SQLite（Web 用 Prisma，桌面用 Go 直连） |
| OJ 集成 | Codeforces OpenID Connect + API |
| AI 分析 | OpenAI 兼容接口（`LLM_API_BASE` 可自定义） |
| 进程管理（生产） | PM2 + ecosystem.config.cjs |

---

## 目录结构

```
algorithm-review-system/
├── backend/                  # Web 后端（Express + TypeScript）
│   └── src/
│       ├── routes/           # auth / problems / submissions / reviews / reports / statistics / integrations
│       ├── services/         # codeforces.ts, llm.ts, report.ts
│       └── lib/              # auth, prisma, rate-limit, review-schedule, idempotency
├── frontend/                 # Web 前端（Next.js）
│   └── src/
│       ├── app/              # Next.js App Router 页面
│       ├── components/       # 共用组件
│       └── lib/              # api.ts, auth.ts, problem.ts
├── apps/
│   ├── desktop-electron/     # Electron 桌面版（主线）
│   │   ├── main/index.mjs    # Electron 主进程，ServiceManager（Go 进程管理）
│   │   ├── preload/index.mjs # contextBridge 暴露 desktopBridge API
│   │   ├── renderer/src/     # React UI（JSX，无 TS）
│   │   │   ├── App.jsx       # 根组件，主题/路由/服务状态
│   │   │   ├── pages/        # DashboardPage / AccountsPage / ReviewPage / SettingsPage / AnalysisPage
│   │   │   ├── components/   # 可复用组件（ProblemDetailPanel, ReviewFilterBar 等）
│   │   │   ├── hooks/        # useOfflineData.js（IndexedDB 缓存 + 同步）等
│   │   │   └── lib/          # api.js, format.js, db.js, sync.js, NavigationContext.jsx
│   │   ├── scripts/          # dev.mjs, build.mjs, start-static.mjs
│   │   └── bin/ojreviewd.exe # Electron 开发/打包使用的 Go 服务二进制
│   ├── server/               # Go 后端服务源码（ojreviewd）
│   └── desktop/              # WinUI C# 历史遗留目录（不参与运行链路）
├── prisma/
│   ├── schema.prisma         # 数据模型
│   └── migrations/           # SQLite 迁移记录
├── scripts/                  # Shell 脚本（dev/start/pm2/backup）
├── docs/                     # 架构文档、部署文档
├── deploy/                   # nginx.conf, cloudflared 配置
├── .env.example              # 环境变量模板
└── ecosystem.config.cjs      # PM2 生产配置
```

---

## 数据模型（Prisma）

```
User → Session（登录态）
     → ExternalAccount（Codeforces 账号绑定）
     → Problem → Submission → Review（AI 分析结果）
               → ReviewQueue（间隔重复复习队列）
               → ProblemSearch（全文搜索索引）
```

---

## 常用命令

### Web 开发
```bash
npm run dev               # 同时启动前端(3000) + 后端(3001)
npm run dev:backend       # 仅后端，tsx watch 热重载
npm run dev:frontend      # 仅前端，Next.js dev server

npm run db:migrate        # 执行 Prisma 迁移
npm run db:generate       # 重新生成 Prisma Client
npm run db:studio         # 打开 Prisma Studio（数据库可视化）

npm run build             # 构建前后端
npm run pm2:start         # 生产环境用 PM2 启动
npm run pm2:stop          # 停止 PM2
npm run ops:backup        # 备份 SQLite
npm run ops:restore       # 恢复 SQLite
npm run ops:smoke         # 冒烟测试
```

### 桌面端开发
```bash
cd apps/desktop-electron
npm install
npm run dev               # 启动 Vite 渲染器 + Electron（含 Go 服务）
npm run dev:renderer      # 仅启动 Vite 渲染器（浏览器调试用，端口 5180）

npm run build             # 构建渲染器 + 打包 Electron
npm run dist              # 生成 Windows 安装包（NSIS）
```

### Go 服务（ojreviewd）
```bash
cd apps/server
go run ./cmd/ojreviewd    # 本地运行（开发时 Electron 会自动回退到此命令）
go build -o bin/ojreviewd.exe ./cmd/ojreviewd  # 构建 Electron 可复用的二进制
```

---

## 环境变量（`.env`，参考 `.env.example`）

| 变量 | 说明 |
|---|---|
| `PORT` | 后端端口（默认 3001） |
| `DATABASE_URL` | SQLite 路径（`file:./dev.db`） |
| `SESSION_TTL_DAYS` | Session 有效期（默认 30） |
| `BACKEND_ORIGIN` | 前端代理目标 |
| `CODEFORCES_OIDC_CLIENT_ID/SECRET` | Codeforces OAuth 凭证 |
| `CODEFORCES_OIDC_REDIRECT_URI` | OAuth 回调地址 |
| `LLM_API_KEY` | AI 分析 API 密钥 |
| `LLM_API_BASE` | AI 接口地址（默认 OpenAI，可替换） |
| `LLM_MODEL` | 使用的模型（默认 `gpt-4o-mini`） |

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

启动来源仅保留三类：
1. `OJREVIEW_SERVICE_PATH` 显式指定的二进制
2. Electron 打包资源目录或 `apps/server/bin/ojreviewd(.exe)`
3. 开发态回退 `go run ./cmd/ojreviewd`

`apps/desktop/` WinUI 目录仅作历史遗留参考，不再被 Electron 启动链路扫描或依赖。

### 浏览器调试模式（无 Electron）
- 当 `window.desktopBridge` 不存在时自动进入浏览器调试模式
- 先尝试 Vite 代理 `/health`，失败后回退到直连 `http://127.0.0.1:38473`
- Go 服务已内置 CORS 中间件（`corsMiddleware`），允许跨域请求
- WSL 环境下 Vite 代理无法直连 Windows 上的 Go 服务（NAT 隔离），需依赖浏览器直连模式

### Go 服务构建（WSL 环境）
- WSL 中未安装 Go，需在 Windows 侧构建：先复制源码到 `C:\Users\ackun\AppData\Local\Temp\`，再用 `"C:\Program Files\Go\bin\go.exe"` 构建
- 构建后手动复制回 `apps/desktop-electron/bin/ojreviewd.exe`
- 启动时需用 `--addr 0.0.0.0:38473` 监听所有接口

### 离线缓存策略（Electron 渲染层）
- `lib/db.js`：IndexedDB 封装，本地持久化
- `lib/sync.js`：同步逻辑，后台 5 分钟轮询
- `hooks/useOfflineData.js`：React hook，提供 `isOnline / isSyncing / sync`

### 主题系统
- 三种模式：`light` / `dark` / `follow-system`
- 存储在 `localStorage("ojreview-theme")`
- 通过 `data-theme="dark"` 属性 + CSS 变量切换，模块加载时立即应用（防止闪白）

### Web 认证
- Session token 通过 `Authorization: Bearer <token>` 或 Cookie 传递
- `attachCurrentUser` 中间件（非强制），`requireAuth` 中间件（强制）

---

## 代码规范

### 通用
- **提交信息**：用中文，格式 `类型: 描述`（如 `feat: 添加 AI 分析按钮`）
- **错误处理**：后端统一用 `next(error)` 抛给全局错误中间件，错误响应格式 `{ error: string }`

### Web 后端（TypeScript）
- 路由文件只做 HTTP 层，业务逻辑放 `services/`
- Prisma 实例统一从 `lib/prisma.ts` 导入，不要重复创建
- 所有写操作路由挂载 `writeLimiter`（30 次/分钟）

### Electron 渲染层（JSX，无 TypeScript）
- 组件放 `pages/` 或单文件，props 不需要 interface
- 状态管理：本地 useState + useCallback，不引入外部状态库
- API 调用统一通过 `lib/api.js` 的 `api` 对象，不要直接 `fetch`
- `window.desktopBridge` 在调用前先判断是否存在（浏览器调试模式下不存在）
- **页面导航**：使用 `lib/NavigationContext.jsx` 提供的 `useNavigation()` hook（`navigateTo(page, state)`），不要通过 prop 传递 `onNavigate`；`navigationState` 携带跨页面参数（如预选题目 ID）
- **AI 分析异步任务**：后端返回 task 对象，前端轮询 `api.getAnalysisTask(id)` 直到 `status === "SUCCESS" | "FAILED"`；轮询用 `setTimeout` + `useRef` 管理，组件卸载时调用 stop 函数清除

### Go 服务（ojreviewd）
- REST API 路径保持与 Web 后端一致（`/api/*`）
- 健康检查端点：`GET /health` 返回 `{ "status": "ok" }`
