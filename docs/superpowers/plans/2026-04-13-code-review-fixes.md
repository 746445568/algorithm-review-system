# Go 代码审查问题修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复代码审查中发现的关键问题和重要问题，包括测试失败、SQL 注入风险、缺少 Context 传播、竞态条件等。

**Architecture:** 采用 TDD 方式，先修复测试使其通过，然后逐个修复安全问题、并发问题和代码质量问题。每个修复都包含验证步骤。

**Tech Stack:** Go 1.26, SQLite, standard library HTTP client, sync.Mutex

---

## File Structure

### 需要修改的文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/server/internal/adapters/judges/codeforces.go` | Modify | 添加 `FetchStatement` 方法 |
| `apps/server/internal/adapters/judges/adapter.go` | Modify | 在接口中添加 `FetchStatement` 方法定义 |
| `apps/server/internal/adapters/ai/openai.go` | Modify | 在 system prompt 中添加"不要输出 JSON" |
| `apps/server/internal/adapters/ai/prompt.go` | Modify | 在 `buildAnalysisPrompt` 中添加"不要输出 JSON" |
| `apps/server/internal/storage/sqlite.go` | Modify | 添加表名白名单验证 |
| `apps/server/internal/adapters/ai/*.go` | Modify | 添加 Context 传播 |
| `apps/server/internal/adapters/judges/*.go` | Modify | 添加 Context 传播 |
| `apps/server/internal/jobs/queue.go` | Modify | 修复竞态条件 |

### 需要创建的测试文件

| 文件 | 说明 |
|------|------|
| `apps/server/internal/storage/sqlite_test.go` | 表名验证测试 |
| `apps/server/internal/adapters/judges/codeforces_statement_test.go` | FetchStatement 集成测试 |

---

## Task 1: 修复 FetchStatement 测试 - 添加缺失的方法

**Files:**
- Modify: `apps/server/internal/adapters/judges/adapter.go`
- Modify: `apps/server/internal/adapters/judges/codeforces.go`
- Test: `apps/server/internal/adapters/judges/codeforces_test.go` (已有)

- [ ] **Step 1: 查看 Adapter 接口定义**

读取 `apps/server/internal/adapters/judges/adapter.go`，确认接口中是否有 `FetchStatement` 方法定义。

- [ ] **Step 2: 在 Adapter 接口中添加 FetchStatement 方法**

如果接口中没有 `FetchStatement` 方法，添加到 `Adapter` 接口：

```go
type Adapter interface {
    // ... 现有方法 ...
    FetchStatement(problemID string) (string, error)
}
```

- [ ] **Step 3: 在 CodeforcesAdapter 中实现 FetchStatement 方法**

在 `apps/server/internal/adapters/judges/codeforces.go` 中添加：

```go
func (a *CodeforcesAdapter) FetchStatement(problemID string) (string, error) {
    contestID, index, err := parseCodeforcesProblemID(problemID)
    if err != nil {
        return "", err
    }

    // 尝试主站点
    url := fmt.Sprintf("https://codeforces.com/problemset/problem/%d/%s", contestID, index)
    statement, err := fetchProblemStatement(a.client, url)
    if err == nil && containsProblemStatement(statement) {
        return statement, nil
    }

    // 回退到镜像站点
    mirrorURL := fmt.Sprintf("http://mirror.codeforces.com/problemset/problem/%d/%s", contestID, index)
    return fetchProblemStatement(a.client, mirrorURL)
}

// fetchProblemStatement 获取题目题面 HTML
func fetchProblemStatement(client *http.Client, url string) (string, error) {
    resp, err := client.Get(url)
    if err != nil {
        return "", fmt.Errorf("fetch problem statement: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return "", fmt.Errorf("unexpected status: %d", resp.StatusCode)
    }

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return "", fmt.Errorf("read response: %w", err)
    }

    return string(body), nil
}

// containsProblemStatement 检查 HTML 是否包含题面内容
func containsProblemStatement(html string) bool {
    return strings.Contains(html, "problem-statement") ||
           strings.Contains(html, "title") ||
           strings.Contains(html, "<p>")
}
```

- [ ] **Step 4: 在 AtCoderAdapter 中添加 FetchStatement 存根方法**

读取 `apps/server/internal/adapters/judges/atcoder.go`，添加类似的 `FetchStatement` 方法。

- [ ] **Step 5: 运行测试验证修复**

```bash
cd apps/server
go test ./internal/adapters/judges -v -run "TestCodeforcesFetchStatement"
```

预期输出：两个测试都通过 (PASS)

- [ ] **Step 6: 添加接口合规性检查**

在 `apps/server/internal/adapters/judges/codeforces.go` 文件末尾添加：

```go
var _ Adapter = (*CodeforcesAdapter)(nil)
```

- [ ] **Step 7: 提交**

```bash
git add apps/server/internal/adapters/judges/codeforces.go
git add apps/server/internal/adapters/judges/adapter.go
git add apps/server/internal/adapters/judges/atcoder.go
git commit -m "fix: implement FetchStatement method for CodeforcesAdapter"
```

---

## Task 2: 修复 AI Prompt 测试 - 添加缺失的提示词

**Files:**
- Modify: `apps/server/internal/adapters/ai/openai.go`
- Modify: `apps/server/internal/adapters/ai/prompt.go` (或包含 `buildAnalysisPrompt` 的文件)
- Test: `apps/server/internal/adapters/ai/prompt_test.go` (已有)

- [ ] **Step 1: 定位 buildAnalysisPrompt 函数**

搜索代码库找到 `buildAnalysisPrompt` 函数的位置。

- [ ] **Step 2: 更新 analysisSystemPrompt 常量**

修改 `apps/server/internal/adapters/ai/openai.go` 中的 `analysisSystemPrompt`：

```go
const analysisSystemPrompt = `你是一位算法竞赛教练。对于每道错题，请按照以下步骤分析：

1. **查找题面**：根据平台 (platform)、题目 ID(externalProblemId)、标题 (title) 和标签 (tags)，请回忆或推断这道题的题面内容。你可以搜索 Codeforces、AtCoder 等平台的题目。

2. **理解题意**：简述题目要求什么，输入输出格式，数据范围。

3. **分析错误**：查看用户的错误提交代码，找出 WA/TLE/RE 等错误的原因。

4. **给出思路**：详细讲解正确的解题思路，包括：
   - 使用什么算法/数据结构
   - 关键思路和技巧
   - 时间/空间复杂度分析

5. **给出代码**：提供一份正确的代码实现（使用 C++，因为大多数 OJ 支持 C++）。

请用中文输出 Markdown 格式，每道题用 ## 题目标题 分隔，使用 ### 作为小节标题，**加粗**标注关键词。**不要输出 JSON**。`
```

- [ ] **Step 3: 更新 buildAnalysisPrompt 函数**

确保 `buildAnalysisPrompt` 函数返回的 prompt 中包含"不要输出 JSON"：

```go
func buildAnalysisPrompt(input string) string {
    return fmt.Sprintf(`错题复盘数据：

%s

请使用中文 Markdown 格式输出，**不要输出 JSON**。`, input)
}
```

- [ ] **Step 4: 运行测试验证**

```bash
cd apps/server
go test ./internal/adapters/ai -v -run "TestAnalysisSystemPrompt"
```

预期输出：PASS

- [ ] **Step 5: 提交**

```bash
git add apps/server/internal/adapters/ai/openai.go
git add apps/server/internal/adapters/ai/*.go  # 包含 buildAnalysisPrompt 的文件
git commit -m "fix: add explicit '不要输出 JSON' instruction to analysis prompts"
```

---

## Task 3: 修复 SQL 注入风险 - 添加表名白名单验证

**Files:**
- Modify: `apps/server/internal/storage/sqlite.go`
- Create: `apps/server/internal/storage/sqlite_test.go`

- [ ] **Step 1: 编写表名验证的失败测试**

创建 `apps/server/internal/storage/sqlite_test.go`：

```go
package storage

import (
    "os"
    "testing"
    "ojreviewdesktop/internal/app"
    cryptovault "ojreviewdesktop/internal/crypto"
)

func TestAddColumnIfMissingRejectsInvalidTableNames(t *testing.T) {
    // 创建临时数据库
    tmpDir := t.TempDir()
    cfg := app.Config{DBPath: tmpDir + "/test.db", DataDir: tmpDir}
    vault := cryptovault.NewVault(make([]byte, 32))
    
    db, err := Open(cfg, vault)
    if err != nil {
        t.Fatalf("Open failed: %v", err)
    }
    defer db.Close()
    
    // 尝试注入恶意表名
    maliciousTable := "users; DROP TABLE owner_profile; --"
    err = db.addColumnIfMissing(maliciousTable, "test_col", "TEXT")
    if err == nil {
        t.Fatal("Expected error for malicious table name, got nil")
    }
    
    // 验证错误消息
    if err.Error() == "" {
        t.Fatal("Expected non-empty error message")
    }
}

func TestAddColumnIfMissingAcceptsValidTableNames(t *testing.T) {
    tmpDir := t.TempDir()
    cfg := app.Config{DBPath: tmpDir + "/test.db", DataDir: tmpDir}
    vault := cryptovault.NewVault(make([]byte, 32))
    
    db, err := Open(cfg, vault)
    if err != nil {
        t.Fatalf("Open failed: %v", err)
    }
    defer db.Close()
    
    // 创建测试表
    _, err = db.conn.Exec("CREATE TABLE test_table (id INTEGER PRIMARY KEY)")
    if err != nil {
        t.Fatalf("Create table failed: %v", err)
    }
    
    // 应该成功添加列
    err = db.addColumnIfMissing("test_table", "new_col", "TEXT")
    if err != nil {
        t.Fatalf("Expected success for valid table, got error: %v", err)
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server
go test ./internal/storage -v -run "TestAddColumnIfMissing"
```

预期：`TestAddColumnIfMissingRejectsInvalidTableNames` 失败（因为还没有添加验证）

- [ ] **Step 3: 在 sqlite.go 中添加表名白名单**

修改 `apps/server/internal/storage/sqlite.go` 中的 `addColumnIfMissing` 函数：

```go
var allowedTables = map[string]bool{
    "platform_accounts":   true,
    "problems":            true,
    "submissions":         true,
    "problem_review_states": true,
    "review_snapshots":    true,
    "analysis_tasks":      true,
    "sync_tasks":          true,
    "owner_profile":       true,
    "schema_meta":         true,
    "problem_chats":       true,
    "contests":            true,
    "goals":               true,
}

func (db *DB) addColumnIfMissing(table, column, definition string) error {
    // 验证表名
    if !allowedTables[table] {
        return fmt.Errorf("invalid table name: %s", table)
    }
    
    var count int
    if err := db.conn.QueryRow(
        fmt.Sprintf(`SELECT COUNT(*) FROM pragma_table_info('%s') WHERE name = ?`, table),
        column,
    ).Scan(&count); err != nil {
        return fmt.Errorf("addColumnIfMissing(%s.%s): pragma: %w", table, column, err)
    }
    // ... 其余代码不变 ...
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd apps/server
go test ./internal/storage -v -run "TestAddColumnIfMissing"
```

预期：两个测试都通过

- [ ] **Step 5: 提交**

```bash
git add apps/server/internal/storage/sqlite.go
git add apps/server/internal/storage/sqlite_test.go
git commit -m "fix: add table name whitelist validation to prevent SQL injection"
```

---

## Task 4: 修复缺少 Context 传播 - HTTP 客户端添加 Context 支持

**Files:**
- Modify: `apps/server/internal/adapters/ai/openai.go`
- Modify: `apps/server/internal/adapters/ai/deepseek.go`
- Modify: `apps/server/internal/adapters/ai/ollama.go`
- Modify: `apps/server/internal/adapters/judges/codeforces.go`
- Modify: `apps/server/internal/adapters/judges/atcoder.go`

- [ ] **Step 1: 修改 AI Provider 接口添加 Context 参数**

读取 `apps/server/internal/adapters/ai/provider.go`，更新接口：

```go
type Provider interface {
    ValidateConfig(Settings) error
    Analyze(ctx context.Context, input string, s Settings) (string, string, error)
}
```

- [ ] **Step 2: 更新 OpenAIProvider.Analyze 方法**

修改 `apps/server/internal/adapters/ai/openai.go`：

```go
func (p *OpenAIProvider) Analyze(ctx context.Context, input string, s Settings) (string, string, error) {
    // ... 现有验证代码 ...
    
    endpoint, err := url.JoinPath(baseURL, "chat/completions")
    if err != nil {
        return "", "", fmt.Errorf("build endpoint URL: %w", err)
    }

    reqBody := openAIChatCompletionRequest{...}
    body, err := json.Marshal(reqBody)
    if err != nil {
        return "", "", fmt.Errorf("marshal request: %w", err)
    }

    // 使用 NewRequestWithContext 创建带 Context 的请求
    req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
    if err != nil {
        return "", "", fmt.Errorf("create request: %w", err)
    }
    req.Header.Set("Authorization", "Bearer "+s.APIKey)
    req.Header.Set("Content-Type", "application/json")

    // 使用带 Context 的 Client
    client := &http.Client{
        Timeout: 120 * time.Second, // 降低超时时间
    }
    
    resp, err := client.Do(req)
    if err != nil {
        return "", "", fmt.Errorf("send request: %w", err)
    }
    defer resp.Body.Close()
    
    // ... 其余处理代码 ...
}
```

- [ ] **Step 3: 更新其他 AI Provider 实现**

同样修改 `deepseek.go` 和 `ollama.go` 中的 `Analyze` 方法，添加 `ctx context.Context` 参数。

- [ ] **Step 4: 修改 judges.Adapter 接口添加 Context**

读取 `apps/server/internal/adapters/judges/adapter.go`，更新方法签名：

```go
type Adapter interface {
    ValidateAccount(ctx context.Context, handle string) error
    FetchSubmissions(ctx context.Context, handle string, cursor string) ([]models.Submission, string, error)
    FetchProblemMetadata(ctx context.Context, problemID string) (models.Problem, []string, error)
    FetchProfile(ctx context.Context, handle string) (UserProfile, error)
    FetchStatement(ctx context.Context, problemID string) (string, error)
    FetchContests(ctx context.Context) ([]models.Contest, error)
}
```

- [ ] **Step 5: 更新 CodeforcesAdapter 实现**

修改 `apps/server/internal/adapters/judges/codeforces.go` 中的所有方法，添加 Context 参数并在 `getJSON` 方法中使用：

```go
func (a *CodeforcesAdapter) getJSON(ctx context.Context, path string, query url.Values, target any) error {
    // ... 现有代码 ...
    
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
    if err != nil {
        return fmt.Errorf("build request: %w", err)
    }
    
    // ... 其余代码 ...
}
```

- [ ] **Step 6: 更新 AtCoderAdapter 实现**

同样修改 `atcoder.go` 中的所有方法。

- [ ] **Step 7: 运行所有测试验证**

```bash
cd apps/server
go test ./... -v
```

- [ ] **Step 8: 提交**

```bash
git add apps/server/internal/adapters/ai/*.go
git add apps/server/internal/adapters/judges/*.go
git commit -m "feat: add context.Context propagation for cancellable HTTP requests"
```

---

## Task 5: 修复 Queue 竞态条件

**Files:**
- Modify: `apps/server/internal/jobs/queue.go`

- [ ] **Step 1: 分析当前竞态条件**

当前问题：
1. `q.ctx` 在锁外被读取
2. goroutine 中访问 `q.inflight` 和 `q.ctx` 没有正确的同步

- [ ] **Step 2: 修复 Enqueue 方法**

修改 `apps/server/internal/jobs/queue.go` 的 `Enqueue` 方法：

```go
func (q *Queue) Enqueue(job Job) bool {
    q.mu.Lock()
    if _, exists := q.inflight[job.Key]; exists {
        q.mu.Unlock()
        return false
    }
    q.inflight[job.Key] = struct{}{}
    // 在锁内复制 ctx
    ctx := q.ctx
    q.mu.Unlock()

    go func(jobCtx context.Context) {
        timer := time.NewTimer(20 * time.Millisecond)
        defer timer.Stop()

        select {
        case <-timer.C:
        case <-jobCtx.Done():
            q.mu.Lock()
            delete(q.inflight, job.Key)
            q.mu.Unlock()
            return
        }

        select {
        case q.workerCh <- job:
        case <-jobCtx.Done():
            q.mu.Lock()
            delete(q.inflight, job.Key)
            q.mu.Unlock()
        }
    }(ctx) // 将 ctx 传递给 goroutine
    
    return true
}
```

- [ ] **Step 3: 添加竞态条件测试**

在 `apps/server/internal/jobs/queue_test.go` 中添加：

```go
func TestQueueEnqueueConcurrentAccess(t *testing.T) {
    tmpDir := t.TempDir()
    cfg := app.Config{DBPath: tmpDir + "/test.db", DataDir: tmpDir}
    vault := cryptovault.NewVault(make([]byte, 32))
    
    db, err := storage.Open(cfg, vault)
    if err != nil {
        t.Fatalf("Open failed: %v", err)
    }
    defer db.Close()
    
    queue := NewQueue(db)
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    queue.Start(ctx)
    
    // 并发提交多个 job
    done := make(chan bool, 100)
    for i := 0; i < 100; i++ {
        go func(id int) {
            job := Job{
                Key:      fmt.Sprintf("test:%d", id),
                TaskType: models.TaskTypeSync,
                TaskID:   int64(id),
                Run:      func(context.Context) error { return nil },
            }
            queue.Enqueue(job)
            done <- true
        }(i)
    }
    
    // 等待所有 job 提交完成
    for i := 0; i < 100; i++ {
        <-done
    }
    
    // 如果竞态检测器没有报错，测试通过
}
```

- [ ] **Step 4: 使用竞态检测器运行测试**

```bash
cd apps/server
go test -race ./internal/jobs -v -run "TestQueueEnqueueConcurrentAccess"
```

预期：没有竞态警告

- [ ] **Step 5: 提交**

```bash
git add apps/server/internal/jobs/queue.go
git add apps/server/internal/jobs/queue_test.go
git commit -m "fix: fix race condition in Queue.inflight map access"
```

---

## Task 6: 运行完整测试套件并验证所有修复

**Files:** 全部修改的文件

- [ ] **Step 1: 运行所有 Go 测试**

```bash
cd apps/server
go test -race ./... -v
```

- [ ] **Step 2: 检查测试覆盖率**

```bash
cd apps/server
go test -cover ./...
```

- [ ] **Step 3: 运行 go vet 静态分析**

```bash
cd apps/server
go vet ./...
```

- [ ] **Step 4: 格式化代码**

```bash
cd apps/server
gofmt -w .
goimports -w .
```

- [ ] **Step 5: 验证构建**

```bash
cd apps/server
go build -o ../desktop-electron/bin/ojreviewd.exe ./cmd/ojreviewd
```

- [ ] **Step 6: 提交最终版本**

```bash
git add .
git commit -m "chore: complete code review fixes - tests, security, concurrency"
```

---

## Task 7: 可选改进 - 代码质量提升

**Files:**
- Modify: `apps/server/internal/srs/sm2.go`
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1: 为 SM-2 算法添加命名常量**

修改 `apps/server/internal/srs/sm2.go`：

```go
const (
    easeFactorBaseIncrement = 0.1
    easeFactorQualityWeight = 0.08
    easeFactorSquaredWeight = 0.02
    minEaseFactor           = 1.3
)

func calculateSM2(easeFactor float64, quality int, repetitionCount int) (float64, int) {
    ef := easeFactor + (easeFactorBaseIncrement - float64(5-quality)*(easeFactorQualityWeight+float64(5-quality)*easeFactorSquaredWeight))
    if ef < minEaseFactor {
        ef = minEaseFactor
    }
    // ...
}
```

- [ ] **Step 2: 添加 CORS 配置选项**

修改 `apps/server/internal/app/config.go` 添加 `AllowedOrigins []string` 配置。

- [ ] **Step 3: 提交**

```bash
git add apps/server/internal/srs/sm2.go
git add apps/server/internal/app/config.go
git commit -m "refactor: improve code quality with named constants and configurable CORS"
```

---

## 验收标准

完成所有任务后，以下标准必须满足：

1. **所有测试通过**: `go test -race ./...` 无失败
2. **无竞态警告**: `-race` 检测器无警告
3. **静态分析通过**: `go vet ./...` 无错误
4. **代码格式化**: `gofmt -l .` 无输出
5. **构建成功**: 二进制文件正常生成

---

## 风险与注意事项

1. **接口变更影响**: 添加 `ctx context.Context` 参数会影响所有调用方，需要同时更新调用代码
2. **测试兼容性**: 现有测试可能需要更新以传递 `context.Background()`
3. **回滚计划**: 每个任务独立提交，便于回滚
