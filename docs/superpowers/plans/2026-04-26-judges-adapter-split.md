# Judges 适配器拆分 Implementation Plan（P3）

> **For agentic workers:** Use checkbox (`- [ ]`) syntax for tracking. Steps are deliberately bite-sized.

**Goal:** 把 `codeforces.go`（546 行）和 `atcoder.go`（512 行）各自按职责拆为 4 个文件（主文件 + client + types + mapper），全程绿测，纯搬运不改逻辑。

**Architecture:** 同包（`package judges`）拆分。Adapter interface 不变，外部调用方零感知。每个文件单一职责。

**Tech Stack:** Go 1.26、`net/http`、标准 `testing` 包。

**Spec:** [docs/superpowers/specs/2026-04-26-judges-adapter-split-design.md](../specs/2026-04-26-judges-adapter-split-design.md)

**与并行任务的边界：** 项目同时有 codex agent 在拆 `apps/server/internal/api/server.go`。本 plan 只动 `apps/server/internal/adapters/judges/` 目录，与之零交集。

---

## Codeforces 函数清单（拆分映射表）

| 行号 | 声明 | 目标文件 |
|---|---|---|
| 21 | `const (...)` | codeforces.go（保留） |
| 29 | `type CodeforcesAdapter struct` | codeforces.go（保留） |
| 77 | `NewCodeforcesAdapter` | codeforces.go（保留） |
| 95 | `(a *CodeforcesAdapter) FetchContests` | codeforces.go（保留） |
| 119 | `(a *CodeforcesAdapter) ValidateAccount` | codeforces.go（保留） |
| 136 | `(a *CodeforcesAdapter) FetchProfile` | codeforces.go（保留） |
| 152 | `(a *CodeforcesAdapter) FetchSubmissions` | codeforces.go（保留） |
| 186 | `(a *CodeforcesAdapter) FetchProblemMetadata` | codeforces.go（保留） |
| 230 | `(a *CodeforcesAdapter) NormalizeSubmission` | codeforces.go（保留） |
| 265 | `(a *CodeforcesAdapter) NextCursor` | codeforces.go（保留） |
| 361 | `(a *CodeforcesAdapter) FetchStatement` | codeforces.go（保留） |
| 36 | `type codeforcesAPIEnvelope` | codeforces_types.go |
| 42 | `type codeforcesUser` | codeforces_types.go |
| 46 | `type codeforcesProblem` | codeforces_types.go |
| 54 | `type codeforcesSubmissionRaw` | codeforces_types.go |
| 65 | `type codeforcesProblemSetResult` | codeforces_types.go |
| 69 | `type codeforcesContest` | codeforces_types.go |
| 282 | `(a *CodeforcesAdapter) getJSON` | codeforces_client.go |
| 349 | `isRetryableError` | codeforces_client.go |
| 380 | `fetchProblemStatement` | codeforces_client.go |
| 406 | `containsProblemStatement` | codeforces_client.go |
| 412 | `(a *CodeforcesAdapter) waitRateLimit` | codeforces_client.go |
| 425 | `parseCodeforcesCursor` | codeforces_mapper.go |
| 451 | `parseCodeforcesProblemID` | codeforces_mapper.go |
| 470 | `formatCodeforcesCursor` | codeforces_mapper.go |
| 474 | `formatCodeforcesProblemID` | codeforces_mapper.go |
| 478 | `toCodeforcesSubmissionRaw` | codeforces_mapper.go |
| 501 | `optionalInt` | codeforces_mapper.go |
| 509 | `mapCodeforcesVerdict` | codeforces_mapper.go |
| 532 | `normalizeContestStatus` | codeforces_mapper.go |

## AtCoder 函数清单（拆分映射表）

| 行号 | 声明 | 目标文件 |
|---|---|---|
| 20 | `const (...)` | atcoder.go（保留） |
| 27 | `var _ Adapter = (*AtCoderAdapter)(nil)` | atcoder.go（保留） |
| 29 | `type AtCoderAdapter struct` | atcoder.go（保留） |
| 63 | `NewAtCoderAdapter` | atcoder.go（保留） |
| 69 | `(a *AtCoderAdapter) FetchContests` | atcoder.go（保留） |
| 116 | `(a *AtCoderAdapter) ValidateAccount` | atcoder.go（保留） |
| 130 | `(a *AtCoderAdapter) FetchProfile` | atcoder.go（保留） |
| 158 | `(a *AtCoderAdapter) FetchSubmissions` | atcoder.go（保留） |
| 190 | `(a *AtCoderAdapter) FetchProblemMetadata` | atcoder.go（保留） |
| 221 | `(a *AtCoderAdapter) NormalizeSubmission` | atcoder.go（保留） |
| 244 | `(a *AtCoderAdapter) NextCursor` | atcoder.go（保留） |
| 305 | `(a *AtCoderAdapter) FetchStatement` | atcoder.go（保留） |
| 37 | `type atCoderSubmission` | atcoder_types.go |
| 50 | `type atCoderProblem` | atcoder_types.go |
| 56 | `type atCoderContest` | atcoder_types.go |
| 260 | `(a *AtCoderAdapter) fetchSubmissionsRaw` | atcoder_client.go |
| 340 | `(a *AtCoderAdapter) loadProblems` | atcoder_client.go |
| 491 | `setAtCoderHeaders` | atcoder_client.go |
| 496 | `atCoderBody` | atcoder_client.go |
| 392 | `parseAtCoderCursor` | atcoder_mapper.go |
| 409 | `parseAtCoderProblemID` | atcoder_mapper.go |
| 424 | `parseAtCoderSubmission` | atcoder_mapper.go |
| 461 | `mapAtCoderVerdict` | atcoder_mapper.go |
| 484 | `atCoderTaskURL` | atcoder_mapper.go |
| 507 | `normalizeAtCoderContestStatus` | atcoder_mapper.go |

---

## Task 0: 基线检查

- [ ] **Step 1: 检查工作树状态，确认 judges/ 目录无未提交修改**

```bash
cd c:/dev/algorithm-review-system
git status apps/server/internal/adapters/judges/
```

Expected: 输出为空（无 M/A/D 行）。如有未提交修改，**停止并报告**——可能 codex 那边产生了影响，需要协调。

- [ ] **Step 2: 跑基线测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go build ./...
go test ./internal/adapters/judges/...
```

Expected: build 成功，所有测试 PASS。如失败**停止报告**。

- [ ] **Step 3: 记录 baseline 行数**

```bash
mkdir -p /tmp/judges-baseline
wc -l apps/server/internal/adapters/judges/codeforces.go apps/server/internal/adapters/judges/atcoder.go > /tmp/judges-baseline/lines.txt
cat /tmp/judges-baseline/lines.txt
```

Expected: 看到 codeforces.go 546、atcoder.go 512（数字可能因近期改动略有偏差）。

---

## Task 1: 抽出 codeforces_types.go

**Files:**
- Create: `apps/server/internal/adapters/judges/codeforces_types.go`
- Modify: `apps/server/internal/adapters/judges/codeforces.go`

- [ ] **Step 1: 新建 codeforces_types.go**

把 6 个 wire types 整段剪切到新文件：
- `codeforcesAPIEnvelope`
- `codeforcesUser`
- `codeforcesProblem`
- `codeforcesSubmissionRaw`
- `codeforcesProblemSetResult`
- `codeforcesContest`

文件头：

```go
package judges

import (
	"encoding/json"
)
```

（如果 types 内未用到 `encoding/json` 的 `RawMessage`，按实际删除；按编译反馈调整）

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go vet ./internal/adapters/judges/...
go build ./...
go test ./internal/adapters/judges/...
```

Expected: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
cd c:/dev/algorithm-review-system
git add apps/server/internal/adapters/judges/codeforces_types.go apps/server/internal/adapters/judges/codeforces.go
git commit -m "refactor: 抽出 judges/codeforces_types.go（wire types）"
```

---

## Task 2: 抽出 codeforces_client.go

**Files:**
- Create: `apps/server/internal/adapters/judges/codeforces_client.go`
- Modify: `apps/server/internal/adapters/judges/codeforces.go`

- [ ] **Step 1: 新建 codeforces_client.go**

剪切：`getJSON`（method）、`isRetryableError`（func）、`fetchProblemStatement`（func）、`containsProblemStatement`（func）、`waitRateLimit`（method）。

文件头：

```go
package judges

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)
```

按编译反馈增删 import。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go vet ./internal/adapters/judges/...
go build ./...
go test ./internal/adapters/judges/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/adapters/judges/codeforces_client.go apps/server/internal/adapters/judges/codeforces.go
git commit -m "refactor: 抽出 judges/codeforces_client.go（HTTP/限流/重试）"
```

---

## Task 3: 抽出 codeforces_mapper.go

**Files:**
- Create: `apps/server/internal/adapters/judges/codeforces_mapper.go`
- Modify: `apps/server/internal/adapters/judges/codeforces.go`

- [ ] **Step 1: 新建 codeforces_mapper.go**

剪切 8 个纯函数：`parseCodeforcesCursor`、`parseCodeforcesProblemID`、`formatCodeforcesCursor`、`formatCodeforcesProblemID`、`toCodeforcesSubmissionRaw`、`optionalInt`、`mapCodeforcesVerdict`、`normalizeContestStatus`。

文件头按实际用到补 import（常见：`fmt`、`strconv`、`strings`、`encoding/json`、`ojreviewdesktop/internal/models`）。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go vet ./internal/adapters/judges/...
go build ./...
go test ./internal/adapters/judges/...
```

Expected: PASS。`codeforces_test.go` 必须 PASS（它会依赖某些 mapper 函数）。

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/adapters/judges/codeforces_mapper.go apps/server/internal/adapters/judges/codeforces.go
git commit -m "refactor: 抽出 judges/codeforces_mapper.go（cursor/verdict 映射）"
```

---

## Task 4: 抽出 atcoder_types.go

**Files:**
- Create: `apps/server/internal/adapters/judges/atcoder_types.go`
- Modify: `apps/server/internal/adapters/judges/atcoder.go`

- [ ] **Step 1: 新建 atcoder_types.go**

剪切：`atCoderSubmission`、`atCoderProblem`、`atCoderContest`。

文件头：

```go
package judges
```

（如 struct 内有 `json.RawMessage` 字段则加 `import "encoding/json"`）

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go vet ./internal/adapters/judges/...
go build ./...
go test ./internal/adapters/judges/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/adapters/judges/atcoder_types.go apps/server/internal/adapters/judges/atcoder.go
git commit -m "refactor: 抽出 judges/atcoder_types.go（wire types）"
```

---

## Task 5: 抽出 atcoder_client.go

**Files:**
- Create: `apps/server/internal/adapters/judges/atcoder_client.go`
- Modify: `apps/server/internal/adapters/judges/atcoder.go`

- [ ] **Step 1: 新建 atcoder_client.go**

剪切：`fetchSubmissionsRaw`（method）、`loadProblems`（method）、`setAtCoderHeaders`（func）、`atCoderBody`（func）。

import 通常包含：`compress/gzip`、`context`、`encoding/json`、`fmt`、`io`、`net/http`、`time`，按编译反馈调整。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go vet ./internal/adapters/judges/...
go build ./...
go test ./internal/adapters/judges/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/adapters/judges/atcoder_client.go apps/server/internal/adapters/judges/atcoder.go
git commit -m "refactor: 抽出 judges/atcoder_client.go（HTTP/headers/解压）"
```

---

## Task 6: 抽出 atcoder_mapper.go

**Files:**
- Create: `apps/server/internal/adapters/judges/atcoder_mapper.go`
- Modify: `apps/server/internal/adapters/judges/atcoder.go`

- [ ] **Step 1: 新建 atcoder_mapper.go**

剪切：`parseAtCoderCursor`、`parseAtCoderProblemID`、`parseAtCoderSubmission`、`mapAtCoderVerdict`、`atCoderTaskURL`、`normalizeAtCoderContestStatus`。

- [ ] **Step 2: 编译 + 测试**

```bash
cd c:/dev/algorithm-review-system/apps/server
go vet ./internal/adapters/judges/...
go build ./...
go test ./internal/adapters/judges/...
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/adapters/judges/atcoder_mapper.go apps/server/internal/adapters/judges/atcoder.go
git commit -m "refactor: 抽出 judges/atcoder_mapper.go（cursor/verdict/URL）"
```

---

## Task 7: 最终验收

- [ ] **Step 1: 检查所有相关文件行数**

```bash
cd c:/dev/algorithm-review-system
wc -l apps/server/internal/adapters/judges/*.go
```

Expected:
- `codeforces.go` ≤ 250 行
- `atcoder.go` ≤ 250 行
- `*_client.go / _types.go / _mapper.go` 每个 ≤ 250 行
- `adapter.go`, `codeforces_test.go`, `htmlmd.go`, `placeholders.go` 行数与开始时一致

- [ ] **Step 2: 全量测试与 vet**

```bash
cd c:/dev/algorithm-review-system/apps/server
go vet ./...
go build ./...
go test ./...
```

Expected: 全部 PASS。

- [ ] **Step 3: 验证 go.mod / 不动文件未被修改**

```bash
cd c:/dev/algorithm-review-system
git diff HEAD~7 -- apps/server/go.mod apps/server/go.sum apps/server/internal/adapters/judges/adapter.go apps/server/internal/adapters/judges/codeforces_test.go apps/server/internal/adapters/judges/htmlmd.go apps/server/internal/adapters/judges/placeholders.go
```

Expected: 无 diff。

- [ ] **Step 4: 报告完成**

输出报告：
- codeforces.go / atcoder.go 拆前/拆后行数
- 6 个新增文件清单 + 各自行数
- 测试通过情况
- 总 commit 数（应为 6 个 refactor commit）

---

## 异常处理

任一情况**立即停下报告**，不要尝试自行修复：

1. 任何 task 的 `go test` 或 `go build` 失败
2. `go vet` 出现新警告
3. 拆分时发现某个函数被多个文件同时使用导致循环依赖（不应发生，但若出现报告）
4. 编译报错涉及非搬运范围内的代码
5. `git status` 在开始或中途显示 `apps/server/internal/adapters/judges/` 被外部修改（codex 不应碰这里）

---

## 不做的事

- 不修改任何函数/方法逻辑
- 不重命名任何标识符
- 不修改 `Adapter` / `ContestAdapter` interface
- 不动 `adapter.go`、`htmlmd.go`、`placeholders.go`、`codeforces_test.go`
- 不动 `apps/server/internal/adapters/judges/` 之外的任何文件
- 不引入新依赖
