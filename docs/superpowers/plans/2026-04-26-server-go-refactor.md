# server.go 巨石拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/server/internal/api/server.go`（1481 行 / 56 函数）按业务领域拆分成多个 `handlers_*.go` 文件，纯搬运不改逻辑，全程绿测。

**Architecture:** 同包（`package api`）拆分。所有 handler 仍是 `*Server` 方法，跨文件访问 `s.db / s.queue / s.adapters` 无需改动。共享工具函数下沉到 `helpers.go`，路由表保留在 `server.go`。

**Tech Stack:** Go 1.26、`net/http`、标准 `testing` 包。

**Spec:** [docs/superpowers/specs/2026-04-26-architecture-refactor-design.md](../specs/2026-04-26-architecture-refactor-design.md)

---

## 当前函数清单（拆分映射表）

| 行号 | 函数 | 目标文件 |
|---|---|---|
| 27 | `const sqliteBusyUserMessage` | server.go（保留） |
| 29 | `type Server` | server.go（保留） |
| 38 | `NewServer` | server.go（保留） |
| 53 | `Router` | server.go（保留） |
| 55 | `corsMiddleware` | server.go（保留） |
| 78 | `Adapters` | server.go（保留） |
| 80 | `routes` | server.go（保留） |
| 123 | `handleHealth` | handlers_health.go |
| 141 | `handleCapabilities` | handlers_health.go |
| 151 | `handleMe` | handlers_health.go |
| 171 | `handleAccounts` | handlers_accounts.go |
| 180 | `handleUpsertAccount` | handlers_accounts.go |
| 212 | `handleDeleteAccount` | handlers_accounts.go |
| 1201 | `handleRefreshRating` | handlers_accounts.go |
| 225 | `handleSyncAccount` | handlers_sync.go |
| 263 | `handleSyncTasks` | handlers_sync.go |
| 941 | `ResumeSyncTask` | handlers_sync.go |
| 958 | `runSyncTask` | handlers_sync.go |
| 1029 | `extractProblemID` | handlers_sync.go |
| 1041 | `extractCodeforcesProblemID` | handlers_sync.go |
| 1060 | `extractAtCoderProblemID` | handlers_sync.go |
| 272 | `handleReviewSummary` | handlers_review.go |
| 281 | `handleGetProblemReviewState` | handlers_review.go |
| 297 | `handlePutProblemReviewState` | handlers_review.go |
| 328 | `handleRateReview` | handlers_review.go |
| 376 | `handleContests` | handlers_contests.go |
| 393 | `handleSyncContests` | handlers_contests.go |
| 420 | `parsePeriodBounds` | handlers_contests.go |
| 442 | `handleAnalysisGenerate` | handlers_analysis.go |
| 541 | `handleAnalysisTask` | handlers_analysis.go |
| 559 | `handleAnalysisGenerateComparison` | handlers_analysis.go |
| 650 | `handleAnalysisGenerateProblem` | handlers_analysis.go |
| 727 | `handleAnalysisLatest` | handlers_analysis.go |
| 1166 | `runAnalysisTask` | handlers_analysis.go |
| 1449 | `handleAnalysisProblemHistory` | handlers_analysis.go |
| 1465 | `translateContent` | handlers_analysis.go |
| 924 | `normalizeAnalysisCreationError` | handlers_analysis.go |
| 953 | `ResumeAnalysisTask` | handlers_analysis.go |
| 740 | `handleGetAISettings` | handlers_settings.go |
| 749 | `handlePutAISettings` | handlers_settings.go |
| 766 | `handleTestAISettings` | handlers_settings.go |
| 798 | `handleGetTheme` | handlers_settings.go |
| 807 | `handlePutTheme` | handlers_settings.go |
| 822 | `handleExportDiagnostics` | handlers_settings.go |
| 831 | `handleBackup` | handlers_settings.go |
| 856 | `handleRestore` | handlers_settings.go |
| 1074 | `handleSubmissions` | handlers_problems.go |
| 1098 | `handleProblems` | handlers_problems.go |
| 1234 | `handleGetGoals` | handlers_goals.go |
| 1246 | `handleCreateGoal` | handlers_goals.go |
| 1281 | `handleDeleteGoal` | handlers_goals.go |
| 1294 | `handleSubmissionStats` | handlers_statistics.go |
| 1314 | `handleReviewStats` | handlers_statistics.go |
| 1327 | `handleListChats` | handlers_chat.go |
| 1342 | `handleSendChat` | handlers_chat.go |
| 1435 | `handleDeleteChats` | handlers_chat.go |
| 892 | `notImplemented` | helpers.go |
| 901 | `parsePlatform` | helpers.go |
| 914 | `writeJSON` | helpers.go |
| 920 | `writeError` | helpers.go |
| 937 | `parseTaskID` | helpers.go |
| 1118 | `parseQueryInt` | helpers.go |
| 1131 | `parseQueryInt64` | helpers.go |
| 1144 | `parseQueryPlatform` | helpers.go |
| 1157 | `parseQueryVerdict` | helpers.go |

`autosync.go` 内全部内容**保持不变**。

---

## Task 0: 预清理 — 提交工作树中已存在的修改

工作树有大量未提交修改（前端 UI 重构 + Go 端 jobEnqueuer/AutoSyncManager 等），如果直接拆分会让 refactor commit 混入业务变更。

- [ ] **Step 1: 检查工作树状态**

```bash
cd c:/dev/algorithm-review-system
git status --short
git diff --stat HEAD
```

Expected: 看到许多 `M` 文件，包括 `apps/server/internal/api/server.go`（37 行）和大量 renderer 修改。

- [ ] **Step 2: 跑一次基线测试，确保当前未提交状态可编译且测试通过**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./...
```

Expected: build 成功，所有测试 PASS。如果失败，**停下来报告**，不要继续。

- [ ] **Step 3: 把当前 Go 端未提交修改单独 commit**

只 stage Go 端修改（前端重构留给用户自己处理）：

```bash
cd c:/dev/algorithm-review-system
git add apps/server/cmd/ojreviewd/main.go \
        apps/server/internal/api/server.go \
        apps/server/internal/storage/settings.go \
        apps/server/internal/storage/sync_tasks.go
git commit -m "chore: 提交 Go 端在飞修改（拆分 server.go 前的清理）"
```

Expected: commit 成功，`git status` 中 Go 端文件不再显示 M。

- [ ] **Step 4: 记录 baseline 路由表与 server.go 行数（供 Task 13 对比）**

```bash
mkdir -p /tmp/refactor-baseline
grep "mux.HandleFunc" apps/server/internal/api/server.go | sort > /tmp/refactor-baseline/routes.txt
wc -l apps/server/internal/api/server.go > /tmp/refactor-baseline/server-go-lines.txt
cat /tmp/refactor-baseline/routes.txt | wc -l
```

Expected: 输出路由数（应为 40 条左右）。

---

## Task 1: 抽出 helpers.go（共享工具函数）

**Files:**
- Create: `apps/server/internal/api/helpers.go`
- Modify: `apps/server/internal/api/server.go`（删除被搬走的函数）

- [ ] **Step 1: 新建 helpers.go**

把以下 9 个函数从 `server.go` 整段剪切到新建的 `apps/server/internal/api/helpers.go`：
- `notImplemented`（line 892）
- `parsePlatform`（line 901）
- `writeJSON`（line 914）
- `writeError`（line 920）
- `parseTaskID`（line 937）
- `parseQueryInt`（line 1118）
- `parseQueryInt64`（line 1131）
- `parseQueryPlatform`（line 1144）
- `parseQueryVerdict`（line 1157）

文件头：

```go
package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"ojreviewdesktop/internal/models"
)
```

注意：根据被搬运函数实际用到的 import 调整，搬完后跑 `goimports` 或手动核对。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go vet ./...
go build ./...
go test ./internal/api/...
```

Expected: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
cd c:/dev/algorithm-review-system
git add apps/server/internal/api/helpers.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/helpers.go（writeJSON/parseQuery 等共享工具）"
```

---

## Task 2: 抽出 handlers_health.go

**Files:**
- Create: `apps/server/internal/api/handlers_health.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_health.go**

把以下 3 个方法从 `server.go` 剪切到新文件：
- `handleHealth`
- `handleCapabilities`
- `handleMe`

文件头：

```go
package api

import (
	"net/http"
	// 根据原方法实际用到的包补充
)
```

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

Expected: PASS。`health_test.go` 必须依然 PASS（它会调到 `handleHealth`）。

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_health.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_health.go"
```

---

## Task 3: 抽出 handlers_accounts.go

**Files:**
- Create: `apps/server/internal/api/handlers_accounts.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_accounts.go**

剪切：`handleAccounts`、`handleUpsertAccount`、`handleDeleteAccount`、`handleRefreshRating`。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_accounts.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_accounts.go"
```

---

## Task 4: 抽出 handlers_sync.go

**Files:**
- Create: `apps/server/internal/api/handlers_sync.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_sync.go**

剪切：`handleSyncAccount`、`handleSyncTasks`、`ResumeSyncTask`、`runSyncTask`、`extractProblemID`、`extractCodeforcesProblemID`、`extractAtCoderProblemID`。

注意：`enqueueSyncTask`、`isSyncAlreadyQueuedError` 已在 `autosync.go`，**不要动**。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

Expected: PASS。`sync_status_test.go` 应继续 PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_sync.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_sync.go"
```

---

## Task 5: 抽出 handlers_review.go

**Files:**
- Create: `apps/server/internal/api/handlers_review.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_review.go**

剪切：`handleReviewSummary`、`handleGetProblemReviewState`、`handlePutProblemReviewState`、`handleRateReview`。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_review.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_review.go"
```

---

## Task 6: 抽出 handlers_contests.go

**Files:**
- Create: `apps/server/internal/api/handlers_contests.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_contests.go**

剪切：`handleContests`、`handleSyncContests`、`parsePeriodBounds`（line 420，是 contests 专用辅助）。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_contests.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_contests.go"
```

---

## Task 7: 抽出 handlers_analysis.go

**Files:**
- Create: `apps/server/internal/api/handlers_analysis.go`
- Modify: `apps/server/internal/api/server.go`

最大的一组——分析相关。

- [ ] **Step 1: 新建 handlers_analysis.go**

剪切：
- `handleAnalysisGenerate`
- `handleAnalysisTask`
- `handleAnalysisGenerateComparison`
- `handleAnalysisGenerateProblem`
- `handleAnalysisLatest`
- `runAnalysisTask`
- `handleAnalysisProblemHistory`
- `translateContent`
- `normalizeAnalysisCreationError`（line 924，仅分析使用）
- `ResumeAnalysisTask`

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

Expected: PASS。`analysis_errors_test.go` 应继续 PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_analysis.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_analysis.go"
```

---

## Task 8: 抽出 handlers_settings.go

**Files:**
- Create: `apps/server/internal/api/handlers_settings.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_settings.go**

剪切：`handleGetAISettings`、`handlePutAISettings`、`handleTestAISettings`、`handleGetTheme`、`handlePutTheme`、`handleExportDiagnostics`、`handleBackup`、`handleRestore`。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_settings.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_settings.go"
```

---

## Task 9: 抽出 handlers_problems.go

**Files:**
- Create: `apps/server/internal/api/handlers_problems.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_problems.go**

剪切：`handleSubmissions`、`handleProblems`。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_problems.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_problems.go"
```

---

## Task 10: 抽出 handlers_goals.go

**Files:**
- Create: `apps/server/internal/api/handlers_goals.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_goals.go**

剪切：`handleGetGoals`、`handleCreateGoal`、`handleDeleteGoal`。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_goals.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_goals.go"
```

---

## Task 11: 抽出 handlers_statistics.go

**Files:**
- Create: `apps/server/internal/api/handlers_statistics.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_statistics.go**

剪切：`handleSubmissionStats`、`handleReviewStats`。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_statistics.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_statistics.go"
```

---

## Task 12: 抽出 handlers_chat.go

**Files:**
- Create: `apps/server/internal/api/handlers_chat.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 新建 handlers_chat.go**

剪切：`handleListChats`、`handleSendChat`、`handleDeleteChats`。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/api/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/api/handlers_chat.go apps/server/internal/api/server.go
git commit -m "refactor: 抽出 api/handlers_chat.go"
```

---

## Task 13: 最终验收

- [ ] **Step 1: 检查 server.go 行数**

```bash
cd c:/dev/algorithm-review-system
wc -l apps/server/internal/api/server.go
```

Expected: ≤ 200 行。如果超出，报告并暂停。

- [ ] **Step 2: 检查每个 handlers 文件行数**

```bash
wc -l apps/server/internal/api/handlers_*.go apps/server/internal/api/helpers.go
```

Expected: 每个 ≤ 400 行。

- [ ] **Step 3: 验证路由表完整（与 Task 0 baseline 对比）**

```bash
cd c:/dev/algorithm-review-system
grep "mux.HandleFunc" apps/server/internal/api/server.go | sort > /tmp/refactor-baseline/routes_after.txt
diff /tmp/refactor-baseline/routes.txt /tmp/refactor-baseline/routes_after.txt
```

Expected: diff 为空（即路由表完全一致）。

- [ ] **Step 4: 全量测试与 vet**

```bash
cd c:/dev/algorithm-review-system/apps/server
go vet ./...
go build ./...
go test ./...
```

Expected: 全部 PASS。

- [ ] **Step 5: 验证 go.mod 未变化**

```bash
cd c:/dev/algorithm-review-system
git diff HEAD~13 -- apps/server/go.mod apps/server/go.sum
```

Expected: 无 diff（仅做了搬运，不应引入新依赖）。

- [ ] **Step 6: 报告完成**

输出一份简短报告：
- server.go 拆分前后行数
- 新增文件清单及各自行数
- 测试通过情况
- 总 commit 数

---

## 异常处理

执行中如遇下列任一情况，**立刻停下并报告**，不要尝试自行修复：

1. 任何 task 的 `go test` 失败
2. `go vet` 出现新警告
3. 拆分时发现某个函数被多个领域同时使用，归类不明确
4. `helpers.go` 抽出后某个被剪切的函数其实只被 server.go 内部用，但被搬走后产生循环或语义变化
5. 编译报错涉及非搬运范围内的代码（说明误删或误改）

---

## 不做的事

- 不修改任何 handler 内部逻辑
- 不重命名任何函数、字段、参数
- 不调整路由路径、HTTP 方法、状态码
- 不引入新依赖（不动 `go.mod`）
- 不修改 `autosync.go`、`storage/`、`adapters/`、`models/` 任何文件
- 不动渲染层任何文件
