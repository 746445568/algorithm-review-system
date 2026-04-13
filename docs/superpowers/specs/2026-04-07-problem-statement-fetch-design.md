# 题面抓取与展示 — 设计文档 v2

## 目标

1. 同步时抓取题面原文并自动翻译为中文，展示为 Markdown
2. 复习页面始终显示题面，方便边看题边做记录
3. 同时抓取题解（尽力而为）
4. 单题 AI 分析改为思路讲解模式，显示完整历史
5. 新增 AI 对话功能（聊天记录持久化到 DB）

---

## 数据层

### `problems` 表新增列（schema version → 4）

```sql
ALTER TABLE problems ADD COLUMN statement_en TEXT;
ALTER TABLE problems ADD COLUMN statement_zh TEXT;
ALTER TABLE problems ADD COLUMN editorial_en TEXT;
ALTER TABLE problems ADD COLUMN editorial_zh TEXT;
```

- `statement_en IS NOT NULL` → 题面已抓取
- `statement_zh IS NOT NULL` → 题面已翻译（中文）
- `editorial_en IS NOT NULL` → 题解已抓取
- `editorial_zh IS NOT NULL` → 题解已翻译

### 新表 `problem_chats`

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

### `models.Problem` 新增字段

```go
StatementEn string `json:"statementEn,omitempty"`
StatementZh string `json:"statementZh,omitempty"`
EditorialEn string `json:"editorialEn,omitempty"`
EditorialZh string `json:"editorialZh,omitempty"`
```

### 新 model `ProblemChat`

```go
type ProblemChat struct {
  ID        int64     `json:"id"`
  ProblemID int64     `json:"problemId"`
  Role      string    `json:"role"`   // "user" | "assistant"
  Content   string    `json:"content"`
  CreatedAt time.Time `json:"createdAt"`
}
```

---

## Adapter 接口扩展

`judges.Adapter` 新增两个方法：

```go
FetchStatement(problemID string) (string, error)
FetchEditorial(problemID string) (string, error)
```

两者均返回 Markdown 纯文字；失败时返回 error，调用方跳过不中断主流程。

### Codeforces — FetchStatement

- 请求 `https://codeforces.com/problemset/problem/{contestId}/{index}`
- 提取 `.problem-statement` div
- HTML → Markdown：
  - `.section-title` → `## 标题`
  - `<p>` → 段落，`<br>` → 换行
  - `<ul>/<li>` → `- 列表`
  - `<strong>` → `**文字**`
  - `<pre>` → ` ```\n代码\n``` `
  - MathJax（`$...$`、`$$...$$`）保留原样
  - 其余 HTML 标签剥除保留文字

### Codeforces — FetchEditorial

- 请求 `https://codeforces.com/contest/{contestId}/material`
- 找页面内 editorial 相关链接（如 "Editorial"、"Tutorial" 文字的 `<a>` 标签）
- 跟进链接，提取博客正文（`.ttypography` 或 `.content` 区域），HTML → Markdown
- 若找不到链接或请求失败，返回 error（静默跳过）

### AtCoder — FetchStatement

- 请求 `https://atcoder.jp/contests/{contestId}/tasks/{taskId}`
- 提取 `#task-statement` div，HTML → Markdown（同上规则）
- 403/302 时返回 error

### AtCoder — FetchEditorial

- 请求 `https://atcoder.jp/contests/{contestId}/editorial`
- 找当前题目对应的 editorial 链接，跟进后提取正文
- 失败时静默跳过

---

## 同步流程

同步 job 在 upsert problem 之后，若 `statement_en IS NULL`：

1. 调 `FetchStatement` → 写入 `statement_en`
2. 若 AI 已配置，立即调 AI 翻译 `statement_en` → `statement_zh`  
   Prompt：`将以下竞赛题面翻译为中文，保留数学公式 $...$ 格式，输出 Markdown，不要加任何解释：\n\n{statement_en}`
3. 调 `FetchEditorial` → 写入 `editorial_en`
4. 若 AI 已配置且 `editorial_en` 非空，翻译 → `editorial_zh`

以上步骤任一失败，只记录日志，不影响同步任务状态。

---

## API 新增端点

### 题面

```
GET  /api/problems/{problemId}/statement
```
Response: `{ "en": "...", "zh": "...", "editorialEn": "...", "editorialZh": "..." }`（字段可为 null）

```
POST /api/problems/{problemId}/statement/translate
```
手动触发翻译（用户在界面点"重新翻译"时调用）。更新并返回 `{ "zh": "..." }`。

### AI 对话

```
GET  /api/problems/{problemId}/chats
```
返回该题的全部聊天记录（按 `created_at` ASC）：`[{ id, role, content, createdAt }, ...]`

```
POST /api/problems/{problemId}/chats
Body: { "message": "这道题为什么要用线段树？" }
```
流程：
1. 写入 `role=user` 消息
2. 构建上下文发送给 AI：
   ```
   你是一位算法竞赛教练。以下是当前题目的信息：
   
   【题面】{statement_zh 或 statement_en}
   【用户笔记】{review_notes}
   【最新分析】{最近一次 analysis_task.result_text（如有）}
   
   请用中文回答用户的问题。
   ```
3. 写入 `role=assistant` 回复
4. 返回 assistant 消息：`{ "id": ..., "role": "assistant", "content": "...", "createdAt": "..." }`

若 AI 未配置，返回 `400 { "error": "请先配置 AI 服务" }`。

```
DELETE /api/problems/{problemId}/chats
```
清空该题聊天记录。返回 `204`。

### AI 分析历史

```
GET /api/analysis/problem/{problemId}/history
```
返回该题所有 analysis tasks（通过 `review_snapshots.problem_id` 关联），按 `created_at` DESC。

---

## AI 单题分析 Prompt 改造

`POST /api/analysis/generate-problem/{problemId}` 的 prompt 改为：

```
你是一位算法竞赛教练，请用中文对以下题目进行详细思路讲解：

【题目】{title}（{platform}，难度 {difficulty}）
【题面】{statement_zh 或 statement_en（如有）}
【提交记录】{verdicts 列表}

请包含：
1. 核心观察与关键性质
2. 算法与数据结构选择及原因
3. 完整解题步骤
4. 时间/空间复杂度分析
5. 常见错误与坑点
```

---

## 前端布局改动

### ReviewDetail 整体布局

原来：单列，顶部 header + tabs

新布局（左右分栏）：
```
┌─────────────────────────────────────────────────────┐
│  nav-bar（← 1/5 →）                                  │
├──────────────────────┬──────────────────────────────┤
│  题面区（左，40%）    │  操作区（右，60%）             │
│  ─────────────────── │  [复习状态][提交][AI分析][对话]│
│  problem header      │                              │
│  EN / 中文  切换      │  tab 内容                    │
│  题面 Markdown       │                              │
│  ─────────────────── │                              │
│  【题解】（折叠）     │                              │
│  题解 Markdown       │                              │
└──────────────────────┴──────────────────────────────┘
```

- 题面区默认显示 `statement_zh`，有「EN / 中文」切换按钮
- 题解默认折叠（`<details>` 或 state 控制），点击展开
- 若 `statement_zh` 为 null 且 `statement_en` 非 null，显示英文并提示"中文翻译中…"（前端调 translate API）
- 若两者均 null，显示"题面暂不可用"

### 操作区 Tabs

去掉原有「题面」独立 tab 和「原始数据」tab。Tabs：

`[复习状态] [提交记录] [AI 助手]`

### AI 助手 Tab（分析 + 对话合并）

```
┌──────────────────────────────────────────┐
│  [生成思路讲解]  [重新生成]               │
│  ── 最新分析（折叠卡片，默认展开）──      │
│  provider · model · 时间                 │
│  分析 Markdown 内容                      │
│  ── 历史分析（折叠，默认收起）──          │
├──────────────────────────────────────────┤
│  ── AI 对话 ──                           │
│  消息列表（滚动区）                       │
│  user: 为什么用线段树？                   │
│  assistant: 因为...                      │
├──────────────────────────────────────────┤
│  [输入框]                    [发送]      │
│                           [清空记录]     │
└──────────────────────────────────────────┘
```

- 分析区在上，对话区在下，分隔线分开
- 发送时 assistant 先显示"思考中…"，返回后替换
- Enter 发送，Shift+Enter 换行
- 聊天记录从 `GET /api/problems/{id}/chats` 加载

### api.js 新增

```js
getStatement(problemId)
translateStatement(problemId)
getProblemChats(problemId)
sendProblemChat(problemId, message)
clearProblemChats(problemId)
getProblemAnalysisHistory(problemId)
```

---

## 不在本次范围内

- Codeforces 登录鉴权（教育场/Gym 题面需要）
- 流式输出（AI 对话目前用 request-response）
- 多语言（日语题面保持英文翻译）
