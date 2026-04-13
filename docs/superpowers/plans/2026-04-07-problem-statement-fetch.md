# 题面抓取与 AI 对话 — 实现计划

> 设计文档：`docs/superpowers/specs/2026-04-07-problem-statement-fetch-design.md`
> 日期：2026-04-07

---

## 总览

把抓取题面（FetchStatement）、自动翻译（AI translate）、题解抓取（FetchEditorial）、AI 对话（problem_chats）集成进现有桌面版流水线，并重构 ReviewDetail 为左右分栏布局，AI 分析与聊天合并到同一 tab。

分四个 Phase 顺序执行，Phase 内部 task 可并行。

---

## Phase 1 — 数据层

### Task 1.1 — models.Problem 新增字段

**文件**：`apps/server/internal/models/types.go`

在 `Problem` struct 末尾（`UpdatedAt` 之后）追加：

```go
StatementEn string `json:"statementEn,omitempty"`
StatementZh string `json:"statementZh,omitempty"`
EditorialEn string `json:"editorialEn,omitempty"`
EditorialZh string `json:"editorialZh,omitempty"`
```

### Task 1.2 — 新增 ProblemChat model

**文件**：`apps/server/internal/models/types.go`

在文件末尾追加：

```go
type ProblemChat struct {
    ID        int64     `json:"id"`
    ProblemID int64     `json:"problemId"`
    Role      string    `json:"role"` // "user" | "assistant"
    Content   string    `json:"content"`
    CreatedAt time.Time `json:"createdAt"`
}
```

### Task 1.3 — SQLite schema 迁移

**文件**：`apps/server/internal/storage/sqlite.go`

1. 将 `schemaVersion` 从 3 改为 4。
2. 在 `ensureSchema()` 的 schema 字符串里，`problems` 表的 `CREATE TABLE IF NOT EXISTS` 已有，无需修改 DDL（新列通过 addColumnIfMissing 添加）。
3. 在 `ensureSchema()` 末尾、`return nil` 之前，加建表语句：
   ```sql
   CREATE TABLE IF NOT EXISTS problem_chats (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
     role        TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
     content     TEXT    NOT NULL,
     created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX IF NOT EXISTS idx_problem_chats_problem_id ON problem_chats(problem_id);
   ```
4. 在 `MigrateWithBackup()` 中，已有 `addColumnIfMissing` 系列调用之后追加：
   ```go
   if err := db.addColumnIfMissing("problems", "statement_en", "TEXT"); err != nil {
       return err
   }
   if err := db.addColumnIfMissing("problems", "statement_zh", "TEXT"); err != nil {
       return err
   }
   if err := db.addColumnIfMissing("problems", "editorial_en", "TEXT"); err != nil {
       return err
   }
   if err := db.addColumnIfMissing("problems", "editorial_zh", "TEXT"); err != nil {
       return err
   }
   ```

### Task 1.4 — Storage 方法：Problem 读写 statement

**文件**：`apps/server/internal/storage/sqlite.go`

新增 4 个方法：

```go
// GetProblemStatement 取出单题的四个 statement/editorial 字段
func (db *DB) GetProblemStatement(id int64) (statementEn, statementZh, editorialEn, editorialZh string, err error)

// UpdateProblemStatement 写入抓取的英文题面和题解（翻译前调用）
func (db *DB) UpdateProblemStatement(id int64, statementEn, editorialEn string) error

// UpdateProblemTranslation 写入翻译结果
func (db *DB) UpdateProblemTranslation(id int64, statementZh, editorialZh string) error
```

SQL 用 `WHERE id = ?`，时间戳同步更新 `updated_at = CURRENT_TIMESTAMP`。

另外修改已有的 `GetProblemByID` / `ListProblems` 等扫描，把四列包含进去（如果这些方法已存在）；如果尚不存在则新增：

```go
func (db *DB) GetProblemByID(id int64) (models.Problem, error)
```

扫描行顺序：`id, platform, external_problem_id, external_contest_id, title, url, difficulty, raw_tags_json, statement_en, statement_zh, editorial_en, editorial_zh, created_at, updated_at`

### Task 1.5 — Storage 方法：problem_chats CRUD

**文件**：`apps/server/internal/storage/sqlite.go`

新增：

```go
func (db *DB) ListProblemChats(problemID int64) ([]models.ProblemChat, error)
func (db *DB) InsertProblemChat(chat models.ProblemChat) (models.ProblemChat, error)
func (db *DB) DeleteProblemChats(problemID int64) error
```

---

## Phase 2 — Adapter 层

### Task 2.1 — Adapter 接口扩展

**文件**：`apps/server/internal/adapters/judges/adapter.go`（或存放接口的文件，grep `type Adapter interface`）

在 `Adapter` interface 追加：

```go
FetchStatement(problemID string) (string, error)
FetchEditorial(problemID string) (string, error)
```

### Task 2.2 — PlaceholderAdapter 实现

**文件**：`apps/server/internal/adapters/judges/placeholders.go`

补全两方法，直接返回空字符串 + nil error：

```go
func (a *PlaceholderAdapter) FetchStatement(problemID string) (string, error) {
    return "", nil
}
func (a *PlaceholderAdapter) FetchEditorial(problemID string) (string, error) {
    return "", nil
}
```

### Task 2.3 — 新建 HTML→Markdown 工具

**文件**：`apps/server/internal/adapters/judges/htmlmd.go`（新建）

实现一个函数 `htmlToMarkdown(htmlStr string) string`，规则：
- `.section-title` → `## 标题`
- `<p>` → 段落，`<br>` → 换行
- `<ul>/<li>` → `- 列表项`
- `<strong>/<b>` → `**文字**`
- `<em>/<i>` → `*文字*`
- `<pre>` → ` ```\n代码\n``` `
- `<a href="...">text</a>` → `[text](href)`
- MathJax `$...$` / `$$...$$` 保留原样（不转义）
- 其余 HTML 标签剥除，保留内部文字

**不引入第三方 HTML 解析库**，用标准库 `golang.org/x/net/html` 或手写正则足矣（用标准库 `regexp` + `strings`）。

注意：`go.mod` 当前没有 `golang.org/x/net`，若要引入需 `go get`；否则用正则方式简单剥标签。推荐用正则，避免新增依赖。

### Task 2.4 — CodeforcesAdapter.FetchStatement

**文件**：`apps/server/internal/adapters/judges/codeforces.go`

problemID 格式为 `<contestId><index>`（如 `1900A`）。拆分方式：从末尾连续字母为 index，前面数字为 contestId。

请求 `https://codeforces.com/problemset/problem/{contestId}/{index}`，提取 `.problem-statement` div 内容，调用 `htmlToMarkdown`，返回。

超时 10s，失败返回 error。

### Task 2.5 — CodeforcesAdapter.FetchEditorial

**文件**：`apps/server/internal/adapters/judges/codeforces.go`

请求 `https://codeforces.com/contest/{contestId}/material`，查找包含 "Editorial"/"Tutorial" 文本的 `<a>` 标签，跟进链接，提取 `.ttypography` 或 `.content`，调用 `htmlToMarkdown`，返回。

任一步骤失败返回 error（静默跳过）。

### Task 2.6 — AtCoderAdapter.FetchStatement

**文件**：`apps/server/internal/adapters/judges/atcoder.go`

problemID 格式：`{contestId}_{taskId}`（如 `abc300_a`）。

请求 `https://atcoder.jp/contests/{contestId}/tasks/{taskId}`，提取 `#task-statement`，`htmlToMarkdown`，返回。

403/302 时返回 error。

### Task 2.7 — AtCoderAdapter.FetchEditorial

**文件**：`apps/server/internal/adapters/judges/atcoder.go`

请求 `https://atcoder.jp/contests/{contestId}/editorial`，找当前题目的 editorial 链接，跟进提取正文，返回。

---

## Phase 3 — API 层 + Sync 集成

### Task 3.1 — 同步流程集成 FetchStatement

**文件**：`apps/server/internal/jobs/`（grep `FetchSubmissions` 或 `upsertProblem`，找到 sync worker）

在 upsert problem 之后，检查 `statement_en IS NULL`，若是：
1. `adapter.FetchStatement(externalProblemID)` → 写 `statement_en`
2. 若 AI 已配置，调 AI 翻译 → 写 `statement_zh`
3. `adapter.FetchEditorial(externalProblemID)` → 写 `editorial_en`
4. 若 AI 已配置，翻译 → 写 `editorial_zh`

任一失败只记 `log.Printf`，不影响 sync 任务状态。

翻译 prompt：
```
将以下竞赛题面翻译为中文，保留数学公式 $...$ 格式，输出 Markdown，不要加任何解释：

{content}
```

### Task 3.2 — API 路由注册

**文件**：`apps/server/internal/api/server.go`，`routes()` 函数末尾追加：

```go
s.mux.HandleFunc("GET /api/problems/{problemId}/statement", s.handleGetStatement)
s.mux.HandleFunc("POST /api/problems/{problemId}/statement/translate", s.handleTranslateStatement)
s.mux.HandleFunc("GET /api/problems/{problemId}/chats", s.handleListChats)
s.mux.HandleFunc("POST /api/problems/{problemId}/chats", s.handleSendChat)
s.mux.HandleFunc("DELETE /api/problems/{problemId}/chats", s.handleDeleteChats)
s.mux.HandleFunc("GET /api/analysis/problem/{problemId}/history", s.handleAnalysisProblemHistory)
```

### Task 3.3 — handleGetStatement

**文件**：`apps/server/internal/api/server.go`（或新建 `statement_handlers.go`）

```
GET /api/problems/{problemId}/statement
Response: { "en": "...", "zh": "...", "editorialEn": "...", "editorialZh": "..." }
```

从 DB 读四列，null 列在 JSON 中为 null。

### Task 3.4 — handleTranslateStatement

```
POST /api/problems/{problemId}/statement/translate
```

- 若 AI 未配置，返回 400 `{"error":"请先配置 AI 服务"}`
- 读 `statement_en`，调 AI 翻译，写 `statement_zh`
- 若有 `editorial_en`，同理翻译写 `editorial_zh`
- 返回 `{ "zh": "...", "editorialZh": "..." }`

### Task 3.5 — handleListChats / handleSendChat / handleDeleteChats

```
GET    /api/problems/{problemId}/chats  → []ProblemChat
POST   /api/problems/{problemId}/chats  body: {"message":"..."}  → ProblemChat (assistant)
DELETE /api/problems/{problemId}/chats  → 204
```

`handleSendChat` 流程：
1. 写入 user 消息
2. 从 DB 读 `statement_zh`（优先）或 `statement_en`，review notes，最近一次 analysis result
3. 构建 prompt（见设计文档），调 AI
4. 写入 assistant 消息
5. 返回 assistant 消息

若 AI 未配置返回 400。

### Task 3.6 — handleAnalysisProblemHistory

```
GET /api/analysis/problem/{problemId}/history
```

查 `analysis_tasks`，通过 `review_snapshots.problem_id = ?` 关联，按 `created_at DESC` 返回。

---

## Phase 4 — 前端

### Task 4.1 — api.js 新增方法

**文件**：`apps/desktop-electron/renderer/src/lib/api.js`

追加：

```js
getStatement(problemId)            // GET /api/problems/{id}/statement
translateStatement(problemId)      // POST /api/problems/{id}/statement/translate
getProblemChats(problemId)         // GET /api/problems/{id}/chats
sendProblemChat(problemId, message)// POST /api/problems/{id}/chats
clearProblemChats(problemId)       // DELETE /api/problems/{id}/chats
getProblemAnalysisHistory(problemId) // GET /api/analysis/problem/{id}/history
```

### Task 4.2 — ReviewDetail 左右分栏布局

**文件**：`apps/desktop-electron/renderer/src/pages/ReviewDetail.jsx`

整体改为水平 flex：
- 左栏 40%：题面区（problem header + EN/中文切换 + Markdown + 折叠题解）
- 右栏 60%：操作区（tabs）

左栏 tabs 去除，直接展示题面；右栏 tabs：`[复习状态] [提交记录] [AI 助手]`（去掉"原始数据"和原"AI分析"独立tab）。

题面区加载：`useEffect` 调 `api.getStatement(problemId)`。
- 有 `statementZh` → 显示中文（默认）
- 无中文有英文 → 显示英文 + "中文翻译中…" 提示，自动调 `translateStatement` 后刷新
- 两者均无 → 显示"题面暂不可用"

EN/中文切换按钮：仅当两者都有时显示。

题解默认折叠，用 `<details>` 或 state 控制。

Markdown 渲染：用现有项目已有的 Markdown 渲染方式（检查是否已引入 marked/react-markdown，若有则复用）。

### Task 4.3 — AI 助手 Tab（分析 + 对话合并）

在 AI 助手 tab 内：

**上半部分 — 分析区：**
- "生成思路讲解" / "重新生成" 按钮（调现有 `api.generateProblemAnalysis`）
- 最新分析卡片（默认展开折叠卡片）：provider · model · 时间 + Markdown 内容
- 历史分析（默认收起折叠）：从 `api.getProblemAnalysisHistory` 加载

**下半部分 — 对话区：**
- 消息列表（滚动区，user/assistant 气泡区分）
- assistant 发送时先显示"思考中…"，返回后替换
- 输入框：Enter 发送，Shift+Enter 换行
- "发送" 按钮 + "清空记录" 按钮
- 聊天记录从 `api.getProblemChats` 加载

分析区和对话区之间加分隔线。

---

## 验收标准

1. `go build ./...` 无编译错误
2. 同步一个 CF 题后，`statement_en` 列非空（可用 sqlite3 查看）
3. 若 AI 已配置，`statement_zh` 非空
4. `GET /api/problems/{id}/statement` 返回四字段
5. `POST /api/problems/{id}/chats` 能返回 AI 回复
6. ReviewDetail 渲染左右分栏，左侧显示题面 Markdown
7. AI 助手 tab 中分析历史与聊天并存

---

## 执行顺序

```
Phase 1 (Task 1.1-1.5) 全部完成
    ↓
Phase 2 (Task 2.1-2.7) 全部完成
    ↓
Phase 3 (Task 3.1-3.6) 全部完成
    ↓
Phase 4 (Task 4.1-4.3) 全部完成
```

Phase 内各 Task 可并行（但 1.3 依赖 1.1/1.2，2.2/2.4/2.5/2.6/2.7 依赖 2.1，3.2-3.6 依赖 3.1，4.2/4.3 依赖 4.1）。
