# 架构优化 Design Spec — 2026-04-26

## 背景

近期对 OJ 错题复盘系统做了大规模重构（commit `a998990`、`fa29a1e`）。仍有若干结构性债务亟需偿还，且当前工作树正在进行前端 UI/CSS 瘦身（styles.css -3643 行、多页面瘦身）以及 Go 端轻度解耦（`jobEnqueuer` 接口、`AutoSyncManager`）。

## 目标

- 解决 `apps/server/internal/api/server.go`（1481 行 / 63 函数）巨石文件
- 不阻塞当前进行中的前端 UI 重构
- 不引入新依赖、不改 API 行为，仅做结构拆分
- 全程绿测：`go test ./...` 每个 step 后必须通过

## 非目标

- 本 spec **不**包含前端数据层统一（P1）和 Storage/Adapter 拆分（P2/P3），那两块在本次重构完成、UI 重构合并后另立 spec
- 不修改路由路径、请求/响应字段、HTTP 状态码
- 不调整业务逻辑、不优化算法
- 不引入新的中间件、依赖注入框架

## 优先级总览（仅记录，不在本 spec 实施）

| 优先级 | 主题 | 状态 |
|---|---|---|
| **P0** | server.go 巨石拆解 | **本 spec 实施** |
| P1 | 前端数据层统一（db.js + sync.js + 5 hooks → 单一 store） | 待立项 |
| P2 | storage/helpers.go + snapshots.go 去杂物 | 待立项 |
| P3 | judges/codeforces.go + atcoder.go 内部分层 | 待立项 |

---

## 设计：server.go 拆分

### 目标结构

```
apps/server/internal/api/
├── server.go              # Server 结构 + NewServer + Router + 中间件 + routes() 路由表（≤200 行）
├── helpers.go             # writeJSON / writeError / parsePagination / decodeJSON 等共享工具
├── errors.go              # isSyncAlreadyQueuedError 等领域错误判断函数
├── autosync.go            # 已存在，不动
├── handlers_health.go     # /health, /api/system/capabilities, /api/me
├── handlers_accounts.go   # /api/accounts/*, /api/accounts/{id}/refresh-rating
├── handlers_sync.go       # /api/accounts/{platform}/sync, /api/sync-tasks, /api/sync/status, runSyncTask, enqueueSyncTask
├── handlers_problems.go   # /api/problems, /api/submissions
├── handlers_review.go     # /api/review/summary, /api/review/items/*, /rate
├── handlers_analysis.go   # /api/analysis/*（含 generate / generate-comparison / generate-problem / latest / {taskId} / problem/{id}/history）
├── handlers_chat.go       # /api/problems/{problemId}/chats（GET/POST/DELETE）
├── handlers_settings.go   # /api/settings/ai/*, /api/settings/theme, /api/settings/data/*
├── handlers_goals.go      # /api/goals
├── handlers_contests.go   # /api/contests, /api/contests/sync
└── handlers_statistics.go # /api/statistics/submissions, /api/statistics/reviews
```

### 拆分原则

1. **纯搬运**：所有 handler 方法签名保持 `func (s *Server) handleXxx(w http.ResponseWriter, r *http.Request)`，逻辑一字不动
2. **同包**：所有文件仍在 `package api`，handler 方法仍是 `*Server` 的方法（因此跨文件调用 `s.db`、`s.queue`、`s.adapters` 完全无变化）
3. **分组依据**：按 URL 路径前缀的业务领域分组，与 `routes()` 注册顺序一致
4. **共享工具下沉**：`writeJSON`、`writeError`、`parseInt`、`decodeJSON`、`getPagination` 等若分布在 server.go 内，统一抽到 `helpers.go`
5. **辅助方法跟随主 handler**：例如 `runSyncTask`、`enqueueSyncTask` 跟随 `handlers_sync.go`；`runAnalysisTask`、`findReusableAnalysisTask` 跟随 `handlers_analysis.go`

### 文件大小目标

每个文件控制在 100–400 行。完成后 `server.go` 自身 ≤ 200 行。

### 不动项

- `routes()` 方法仍留在 `server.go`，作为唯一路由表入口
- `corsMiddleware`、`Adapters()`、`Router()`、`NewServer` 留在 `server.go`
- 包级常量 `sqliteBusyUserMessage` 保留在 `server.go`（如有更多常量，集中放 `server.go` 顶部）
- `autosync.go` 已存在，不动

---

## 验收标准

| # | 标准 | 验证方式 |
|---|---|---|
| 1 | 拆分后 `server.go` ≤ 200 行 | `wc -l` |
| 2 | 任何单个 `handlers_*.go` ≤ 400 行 | `wc -l` |
| 3 | 所有 Go 测试通过 | `go test ./...` |
| 4 | `go vet ./...` 无警告 | `go vet ./...` |
| 5 | `go build ./...` 成功 | `go build ./...` |
| 6 | 路由表（URL 列表）与拆分前完全一致 | `grep "mux.HandleFunc" apps/server/internal/api/*.go` 与拆前 diff |
| 7 | 不新增 import 包 | `go.mod` 无变化 |
| 8 | 不修改 handler 内部逻辑 | code review：每个 handler 与拆前 byte-diff = 仅缩进/位置变化 |

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 拆分时遗漏某个 handler / 辅助函数 | 拆完后 grep 路由列表对比；运行所有测试 |
| 工作树有未提交的 server.go 修改（37 行 diff） | 先把当前未提交修改单独 commit，再开始拆分；避免合并冲突 |
| 跨 handler 共享的 unexported 类型/常量被遗漏 | 集中放 `server.go` 顶部或 `helpers.go`；编译失败会立即暴露 |
| 与正在进行的前端 UI 重构冲突 | 本 spec 完全不碰 `apps/desktop-electron/`，零冲突 |

---

## 执行说明

- **执行人**：Codex agent（通过 `Agent(subagent_type="codex")` 派发）
- **分支策略**：在当前分支直接做（用户偏好），每完成 2-3 个 handler 文件做一次 commit
- **commit message 格式**：`refactor: 拆分 server.go 至 handlers_<domain>.go`（中文，遵循项目规范）

---

## 后续（非本 spec）

P1（前端数据层统一）独立立项时机：当前 UI 重构 commit 后立刻启动。届时另写 spec：`docs/superpowers/specs/YYYY-MM-DD-frontend-store-unification-design.md`。
