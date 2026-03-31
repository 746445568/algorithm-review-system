# AI 分析页 — Plan A：Go 后端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ojreviewd Go 服务新增时段过滤分析、环比分析、单题分析、最新分析查询四个能力，作为前端 AI 分析页的数据支撑。

**Architecture:** 在现有 snapshot+task 队列体系上扩展：新增 `snapshot_type`/`problem_id` 列做类型隔离；用 `addColumnIfMissing` 做幂等迁移；`GetReviewSummaryForPeriod` 复用查询逻辑并加时段过滤；环比在后端合并两期数据进一个 snapshot 发给 LLM 做真正跨期对比。

**Tech Stack:** Go 1.26，SQLite (modernc.org/sqlite)，`net/http` ServeMux，现有 `internal/storage`、`internal/api`、`internal/models` 包

---

## 重要协调说明

本计划的数据库迁移采用 **幂等 `addColumnIfMissing`** 方式（不依赖 schema version 号），因此可以安全地与间隔重复算法的迁移并行独立进行，互不干扰。

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|---|---|---|
| 修改 | `apps/server/internal/storage/sqlite.go` | 迁移助手 + 新增 DB 函数 |
| 修改 | `apps/server/internal/api/server.go` | 修改 generate + 新增三个 handler |

无需修改 `models/types.go`（`AnalysisTask` 已够用，新列只做存储不需回传）。

---

## Task 1：幂等数据库迁移

**Files:**
- Modify: `apps/server/internal/storage/sqlite.go`

- [ ] **Step 1：在 `ensureSchema()` 的 `review_snapshots` 建表语句中加入新列**

  找到第 170-174 行的 CREATE TABLE：
  ```sql
  CREATE TABLE IF NOT EXISTS review_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summary_json TEXT NOT NULL
  );
  ```

  替换为：
  ```sql
  CREATE TABLE IF NOT EXISTS review_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summary_json TEXT NOT NULL,
    snapshot_type TEXT NOT NULL DEFAULT 'global',
    problem_id INTEGER
  );
  ```

  这确保全新安装直接拥有新列。

- [ ] **Step 2：在 `sqlite.go` 中添加 `addColumnIfMissing` 幂等助手**

  在 `Close()` 方法（第 75 行）之后插入：

  ```go
  // addColumnIfMissing adds a column to table if it does not yet exist.
  // Safe to call on every startup (idempotent).
  func (db *DB) addColumnIfMissing(table, column, definition string) error {
  	var count int
  	if err := db.conn.QueryRow(
  		fmt.Sprintf(`SELECT COUNT(*) FROM pragma_table_info('%s') WHERE name = ?`, table),
  		column,
  	).Scan(&count); err != nil {
  		return fmt.Errorf("addColumnIfMissing(%s.%s): pragma: %w", table, column, err)
  	}
  	if count > 0 {
  		return nil
  	}
  	_, err := db.conn.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN %s %s`, table, column, definition))
  	if err != nil {
  		return fmt.Errorf("addColumnIfMissing(%s.%s): alter: %w", table, column, err)
  	}
  	return nil
  }
  ```

- [ ] **Step 3：在 `MigrateWithBackup()` 末尾调用迁移**

  找到第 77-88 行的 `MigrateWithBackup`：
  ```go
  func (db *DB) MigrateWithBackup() error {
  	if _, err := os.Stat(db.cfg.DBPath); err == nil {
  		...
  	}
  	if err := db.ensureSchema(); err != nil {
  		return err
  	}
  	return nil
  }
  ```

  在 `return nil` 之前插入：
  ```go
  	// Idempotent column additions for existing databases
  	if err := db.addColumnIfMissing("review_snapshots", "snapshot_type", "TEXT NOT NULL DEFAULT 'global'"); err != nil {
  		return err
  	}
  	if err := db.addColumnIfMissing("review_snapshots", "problem_id", "INTEGER"); err != nil {
  		return err
  	}
  	return nil
  ```

- [ ] **Step 4：更新 `CreateReviewSnapshot` 的 INSERT 语句**

  找到第 759 行：
  ```go
  _, err = db.conn.Exec(`INSERT INTO review_snapshots(summary_json) VALUES (?)`, string(bytes))
  ```
  替换为：
  ```go
  _, err = db.conn.Exec(`INSERT INTO review_snapshots(summary_json, snapshot_type) VALUES (?, 'global')`, string(bytes))
  ```

- [ ] **Step 5：编译验证**

  ```bash
  cd apps/server
  go build ./...
  ```
  期望：无错误，无警告。

- [ ] **Step 6：手动验证列存在**

  在 WSL 外的 Windows 终端运行 Go 服务，或直接查 SQLite 文件：
  ```bash
  # Linux 侧查（需 sqlite3 工具）
  sqlite3 ~/.local/share/ojreview/ojreview.db ".schema review_snapshots"
  # 期望输出中包含 snapshot_type 和 problem_id 两列
  ```

- [ ] **Step 7：提交**

  ```bash
  cd apps/server
  git add internal/storage/sqlite.go
  git commit -m "feat(db): review_snapshots 增加 snapshot_type/problem_id 列，幂等迁移"
  ```

---

## Task 2：`GetReviewSummaryForPeriod` 时段过滤函数

**Files:**
- Modify: `apps/server/internal/storage/sqlite.go`

本任务在 `GetReviewSummary()` 之后（约第 1700 行）新增 `GetReviewSummaryForPeriod(start, end time.Time)`。
该函数与 `GetReviewSummary` 结构相同，区别在于每个涉及 `submissions` 表的查询末尾增加 `AND s.submitted_at BETWEEN ? AND ?`（或单表查询增加 `WHERE submitted_at BETWEEN ? AND ?`）。
`start` 和 `end` 都以 RFC3339 字符串形式传入 SQLite 参数。

- [ ] **Step 1：在 `GetReviewSummary` 末尾之后添加新函数**

  找到 `GetReviewSummary` 函数结束位置（返回 `summary` 的那行），在其正下方插入：

  ```go
  // GetReviewSummaryForPeriod is like GetReviewSummary but restricts
  // submission data to the half-open interval [start, end].
  func (db *DB) GetReviewSummaryForPeriod(start, end time.Time) (map[string]any, error) {
  	startStr := start.UTC().Format(time.RFC3339)
  	endStr := end.UTC().Format(time.RFC3339)

  	summary := map[string]any{
  		"totalSubmissions":     0,
  		"acRate":               0.0,
  		"weakTags":             []map[string]any{},
  		"repeatedFailures":     []map[string]any{},
  		"recentUnsolved":       []map[string]any{},
  		"problemSummaries":     []map[string]any{},
  		"contestGroups":        []map[string]any{},
  		"reviewStatusCounts":   map[string]int{},
  		"dueReviewCount":       0,
  		"scheduledReviewCount": 0,
  		"periodStart":          startStr,
  		"periodEnd":            endStr,
  	}

  	// 1. totalSubmissions + acRate (period-scoped)
  	var totalSubmissions int
  	var acCount int
  	if err := db.conn.QueryRow(`
  		SELECT
  			COUNT(*) AS total_submissions,
  			COALESCE(SUM(CASE WHEN verdict = ? THEN 1 ELSE 0 END), 0) AS ac_count
  		FROM submissions
  		WHERE submitted_at BETWEEN ? AND ?`,
  		models.VerdictAC, startStr, endStr).Scan(&totalSubmissions, &acCount); err != nil {
  		return nil, fmt.Errorf("get review summary period: query totals: %w", err)
  	}
  	summary["totalSubmissions"] = totalSubmissions
  	if totalSubmissions > 0 {
  		acRate := math.Round((float64(acCount)*100.0/float64(totalSubmissions))*10) / 10
  		summary["acRate"] = acRate
  	}

  	// 2. weakTags (period-scoped)
  	weakTagRows, err := db.conn.Query(`
  		SELECT
  			pt.tag_name,
  			COUNT(*) AS attempts,
  			SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count
  		FROM problem_tags pt
  		JOIN submissions s ON s.problem_id = pt.problem_id
  		WHERE s.submitted_at BETWEEN ? AND ?
  		GROUP BY pt.tag_name
  		HAVING COUNT(*) >= 2
  		ORDER BY (SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) ASC
  		LIMIT 5`,
  		models.VerdictAC, startStr, endStr, models.VerdictAC)
  	if err != nil {
  		return nil, fmt.Errorf("get review summary period: query weak tags: %w", err)
  	}
  	defer weakTagRows.Close()

  	weakTags := make([]map[string]any, 0, 5)
  	for weakTagRows.Next() {
  		var tagName string
  		var attempts int
  		var tagAC int
  		if err := weakTagRows.Scan(&tagName, &attempts, &tagAC); err != nil {
  			return nil, fmt.Errorf("get review summary period: scan weak tags: %w", err)
  		}
  		acRate := 0.0
  		if attempts > 0 {
  			acRate = math.Round(float64(tagAC)*100.0/float64(attempts)*10) / 10
  		}
  		weakTags = append(weakTags, map[string]any{
  			"tag":      tagName,
  			"attempts": attempts,
  			"acCount":  tagAC,
  			"acRate":   acRate,
  		})
  	}
  	summary["weakTags"] = weakTags

  	// 3. repeatedFailures (period-scoped)
  	repeatedRows, err := db.conn.Query(`
  		SELECT
  			s.problem_id,
  			p.external_problem_id,
  			p.title,
  			COUNT(*) AS failed_count
  		FROM submissions s
  		JOIN problems p ON p.id = s.problem_id
  		WHERE s.verdict IN (?, ?, ?) AND s.submitted_at BETWEEN ? AND ?
  		GROUP BY s.problem_id, p.external_problem_id, p.title
  		HAVING COUNT(*) >= 2
  		AND NOT EXISTS (
  			SELECT 1 FROM submissions s2
  			WHERE s2.problem_id = s.problem_id AND s2.verdict = ?
  			  AND s2.submitted_at BETWEEN ? AND ?
  		)
  		ORDER BY failed_count DESC
  		LIMIT 10`,
  		models.VerdictWA, models.VerdictRE, models.VerdictTLE, startStr, endStr,
  		models.VerdictAC, startStr, endStr)
  	if err != nil {
  		return nil, fmt.Errorf("get review summary period: query repeated failures: %w", err)
  	}
  	defer repeatedRows.Close()

  	repeatedFailures := make([]map[string]any, 0)
  	for repeatedRows.Next() {
  		var problemID int64
  		var externalProblemID, title string
  		var failedCount int
  		if err := repeatedRows.Scan(&problemID, &externalProblemID, &title, &failedCount); err != nil {
  			return nil, fmt.Errorf("get review summary period: scan repeated failures: %w", err)
  		}
  		repeatedFailures = append(repeatedFailures, map[string]any{
  			"problemId":         problemID,
  			"externalProblemId": externalProblemID,
  			"title":             title,
  			"failedCount":       failedCount,
  		})
  	}
  	summary["repeatedFailures"] = repeatedFailures

  	// 4. recentUnsolved (period-scoped)
  	recentRows, err := db.conn.Query(`
  		SELECT
  			s.problem_id,
  			p.external_problem_id,
  			p.title,
  			MAX(s.submitted_at) AS last_submitted_at
  		FROM submissions s
  		JOIN problems p ON p.id = s.problem_id
  		WHERE s.verdict != ? AND s.submitted_at BETWEEN ? AND ?
  		GROUP BY s.problem_id, p.external_problem_id, p.title
  		ORDER BY last_submitted_at DESC
  		LIMIT 10`,
  		models.VerdictAC, startStr, endStr)
  	if err != nil {
  		return nil, fmt.Errorf("get review summary period: query recent unsolved: %w", err)
  	}
  	defer recentRows.Close()

  	recentUnsolved := make([]map[string]any, 0, 10)
  	for recentRows.Next() {
  		var problemID int64
  		var externalProblemID, title, lastSubmittedAt string
  		if err := recentRows.Scan(&problemID, &externalProblemID, &title, &lastSubmittedAt); err != nil {
  			return nil, fmt.Errorf("get review summary period: scan recent unsolved: %w", err)
  		}
  		recentUnsolved = append(recentUnsolved, map[string]any{
  			"problemId":         problemID,
  			"externalProblemId": externalProblemID,
  			"title":             title,
  			"lastSubmittedAt":   lastSubmittedAt,
  		})
  	}
  	summary["recentUnsolved"] = recentUnsolved

  	return summary, nil
  }
  ```

- [ ] **Step 2：编译验证**

  ```bash
  cd apps/server && go build ./...
  ```
  期望：零错误。

- [ ] **Step 3：提交**

  ```bash
  git add internal/storage/sqlite.go
  git commit -m "feat(db): 新增 GetReviewSummaryForPeriod 时段过滤查询"
  ```

---

## Task 3：时段边界计算 + 修改 `handleAnalysisGenerate`

**Files:**
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1：在 `server.go` 中添加 `parsePeriodBounds` 辅助函数**

  在 `handleAnalysisGenerate` 之前插入：

  ```go
  // parsePeriodBounds returns the [start, end) of the requested calendar period
  // relative to now. "week" = Mon–Sun of current ISO week; "month" = 1st–last of current month.
  func parsePeriodBounds(period string, now time.Time) (start, end time.Time, err error) {
  	now = now.UTC()
  	switch period {
  	case "week":
  		weekday := int(now.Weekday())
  		if weekday == 0 {
  			weekday = 7 // Sunday → 7 in ISO week
  		}
  		monday := now.AddDate(0, 0, -(weekday - 1))
  		start = time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, time.UTC)
  		end = start.AddDate(0, 0, 7).Add(-time.Nanosecond)
  		return
  	case "month":
  		start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
  		end = start.AddDate(0, 1, 0).Add(-time.Nanosecond)
  		return
  	default:
  		err = fmt.Errorf("unknown period %q: must be 'week' or 'month'", period)
  		return
  	}
  }
  ```

- [ ] **Step 2：修改 `handleAnalysisGenerate` 接受 `period` 参数**

  找到第 336-395 行的 handler。将 payload struct 从：
  ```go
  var payload struct {
  	Provider        string `json:"provider"`
  	Model           string `json:"model"`
  	InputSnapshotID int64  `json:"inputSnapshotId"`
  }
  ```
  改为：
  ```go
  var payload struct {
  	Period          string `json:"period"`
  	Provider        string `json:"provider"`
  	Model           string `json:"model"`
  	InputSnapshotID int64  `json:"inputSnapshotId"`
  }
  ```

  然后找到生成 snapshot 的那个 if 块（第 362-374 行）：
  ```go
  if payload.InputSnapshotID == 0 {
  	summary, err := s.db.GetReviewSummary()
  	if err != nil { ... }
  	snapshot, err := s.db.CreateReviewSnapshot(summary)
  	if err != nil { ... }
  	payload.InputSnapshotID = snapshot.ID
  }
  ```

  替换为：
  ```go
  if payload.InputSnapshotID == 0 {
  	var summary map[string]any
  	if payload.Period == "" || payload.Period == "all" {
  		summary, err = s.db.GetReviewSummary()
  	} else {
  		var periodStart, periodEnd time.Time
  		periodStart, periodEnd, err = parsePeriodBounds(payload.Period, time.Now())
  		if err != nil {
  			writeError(w, http.StatusBadRequest, err.Error())
  			return
  		}
  		summary, err = s.db.GetReviewSummaryForPeriod(periodStart, periodEnd)
  	}
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}
  	snapshot, err := s.db.CreateReviewSnapshot(summary)
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}
  	payload.InputSnapshotID = snapshot.ID
  }
  ```

- [ ] **Step 3：编译验证**

  ```bash
  cd apps/server && go build ./...
  ```

- [ ] **Step 4：手动验证（需 AI 已配置）**

  ```bash
  curl -s -X POST http://localhost:38473/api/analysis/generate \
    -H "Content-Type: application/json" \
    -d '{"period":"week"}' | jq .task.status
  # 期望: "PENDING" 或 "RUNNING"
  ```

- [ ] **Step 5：提交**

  ```bash
  git add internal/api/server.go
  git commit -m "feat(api): generate 端点支持 period 参数时段过滤"
  ```

---

## Task 4：`CreateTypedSnapshotJSON` + `GetProblemAnalysisData` DB 函数

**Files:**
- Modify: `apps/server/internal/storage/sqlite.go`

- [ ] **Step 1：添加 `CreateTypedSnapshotJSON` 函数**

  在 `CreateReviewSnapshot` 之后插入：

  ```go
  // CreateTypedSnapshotJSON stores a pre-serialised JSON blob with explicit
  // snapshot_type and optional problem_id. Used by comparison and problem endpoints.
  func (db *DB) CreateTypedSnapshotJSON(summaryJSON, snapshotType string, problemID *int64) (models.ReviewSnapshot, error) {
  	var err error
  	if problemID != nil {
  		_, err = db.conn.Exec(
  			`INSERT INTO review_snapshots(summary_json, snapshot_type, problem_id) VALUES (?, ?, ?)`,
  			summaryJSON, snapshotType, *problemID,
  		)
  	} else {
  		_, err = db.conn.Exec(
  			`INSERT INTO review_snapshots(summary_json, snapshot_type) VALUES (?, ?)`,
  			summaryJSON, snapshotType,
  		)
  	}
  	if err != nil {
  		return models.ReviewSnapshot{}, err
  	}
  	row := db.conn.QueryRow(`SELECT id, generated_at, summary_json FROM review_snapshots WHERE id = last_insert_rowid()`)
  	return scanReviewSnapshot(row)
  }
  ```

- [ ] **Step 2：添加 `GetProblemAnalysisData` 函数**

  在 `GetProblemReviewState` 之后插入：

  ```go
  type ProblemAnalysisData struct {
  	ProblemID         int64              `json:"problemId"`
  	ExternalProblemID string             `json:"externalProblemId"`
  	Title             string             `json:"title"`
  	Platform          string             `json:"platform"`
  	Tags              []string           `json:"tags"`
  	Notes             string             `json:"notes"`
  	Submissions       []map[string]any   `json:"submissions"`
  }

  func (db *DB) GetProblemAnalysisData(problemID int64) (*ProblemAnalysisData, error) {
  	// 1. Problem metadata
  	row := db.conn.QueryRow(`
  SELECT id, COALESCE(external_problem_id,''), COALESCE(title,''), COALESCE(platform,'')
  FROM problems WHERE id = ?`, problemID)
  	var d ProblemAnalysisData
  	d.ProblemID = problemID
  	if err := row.Scan(&d.ProblemID, &d.ExternalProblemID, &d.Title, &d.Platform); err != nil {
  		return nil, fmt.Errorf("get problem analysis data: problem not found: %w", err)
  	}

  	// 2. Tags
  	tagRows, err := db.conn.Query(`SELECT tag_name FROM problem_tags WHERE problem_id = ?`, problemID)
  	if err != nil {
  		return nil, fmt.Errorf("get problem analysis data: tags: %w", err)
  	}
  	defer tagRows.Close()
  	d.Tags = make([]string, 0)
  	for tagRows.Next() {
  		var t string
  		if err := tagRows.Scan(&t); err != nil {
  			return nil, err
  		}
  		d.Tags = append(d.Tags, t)
  	}

  	// 3. Notes from review state
  	noteRow := db.conn.QueryRow(`SELECT COALESCE(notes,'') FROM problem_review_states WHERE problem_id = ?`, problemID)
  	_ = noteRow.Scan(&d.Notes) // ok if no row (notes stays "")

  	// 4. Submissions (all, ordered by time)
  	subRows, err := db.conn.Query(`
  SELECT verdict, COALESCE(language,''), submitted_at,
       COALESCE(exec_time_ms, 0), COALESCE(memory_kb, 0)
  FROM submissions WHERE problem_id = ? ORDER BY submitted_at ASC`, problemID)
  	if err != nil {
  		return nil, fmt.Errorf("get problem analysis data: submissions: %w", err)
  	}
  	defer subRows.Close()
  	d.Submissions = make([]map[string]any, 0)
  	for subRows.Next() {
  		var verdict, lang, submittedAt string
  		var execMs, memKb int
  		if err := subRows.Scan(&verdict, &lang, &submittedAt, &execMs, &memKb); err != nil {
  			return nil, err
  		}
  		d.Submissions = append(d.Submissions, map[string]any{
  			"verdict":         verdict,
  			"language":        lang,
  			"submittedAt":     submittedAt,
  			"executionTimeMs": execMs,
  			"memoryKb":        memKb,
  		})
  	}

  	return &d, nil
  }
  ```

- [ ] **Step 3：添加 `GetLatestGlobalAnalysisTask` 函数**

  在 `GetAnalysisTask` 之后插入：

  ```go
  // GetLatestGlobalAnalysisTask returns the most recent successful global analysis,
  // used by the Dashboard card. Returns sql.ErrNoRows if none found.
  func (db *DB) GetLatestGlobalAnalysisTask() (models.AnalysisTask, error) {
  	row := db.conn.QueryRow(`
  SELECT at.id, at.status, at.provider, at.model, at.input_snapshot_id,
         COALESCE(at.result_text,''), COALESCE(at.result_json,''), COALESCE(at.error_message,''),
         at.retry_count, at.created_at, at.updated_at
  FROM analysis_tasks at
  JOIN review_snapshots rs ON rs.id = at.input_snapshot_id
  WHERE rs.snapshot_type = 'global' AND at.status = ?
  ORDER BY at.created_at DESC LIMIT 1`, models.TaskSuccess)
  	return scanAnalysisTask(row)
  }
  ```

- [ ] **Step 4：编译验证**

  ```bash
  cd apps/server && go build ./...
  ```

- [ ] **Step 5：提交**

  ```bash
  git add internal/storage/sqlite.go
  git commit -m "feat(db): CreateTypedSnapshotJSON / GetProblemAnalysisData / GetLatestGlobalAnalysisTask"
  ```

---

## Task 5：`handleAnalysisGenerateComparison` — 环比端点

**Files:**
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1：在 routes() 中注册新路由**

  在 `s.mux.HandleFunc("POST /api/analysis/generate", ...)` 之后插入：
  ```go
  s.mux.HandleFunc("POST /api/analysis/generate-comparison", s.handleAnalysisGenerateComparison)
  s.mux.HandleFunc("POST /api/analysis/generate-problem/{problemId}", s.handleAnalysisGenerateProblem)
  s.mux.HandleFunc("GET /api/analysis/latest", s.handleAnalysisLatest)
  ```

- [ ] **Step 2：实现 `handleAnalysisGenerateComparison`**

  在 `handleAnalysisGenerate` 之后插入：

  ```go
  func (s *Server) handleAnalysisGenerateComparison(w http.ResponseWriter, r *http.Request) {
  	var payload struct {
  		Period   string `json:"period"`
  		Provider string `json:"provider"`
  		Model    string `json:"model"`
  	}
  	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
  		writeError(w, http.StatusBadRequest, "invalid json body")
  		return
  	}
  	if payload.Period == "" {
  		writeError(w, http.StatusBadRequest, "period is required")
  		return
  	}

  	settings, err := s.db.LoadAISettings()
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}
  	if payload.Provider == "" {
  		payload.Provider = settings.Provider
  	}
  	if payload.Model == "" {
  		payload.Model = settings.Model
  	}
  	if payload.Provider == "" || payload.Model == "" {
  		writeError(w, http.StatusBadRequest, "provider and model are required; configure AI settings first")
  		return
  	}

  	now := time.Now()
  	thisStart, thisEnd, err := parsePeriodBounds(payload.Period, now)
  	if err != nil {
  		writeError(w, http.StatusBadRequest, err.Error())
  		return
  	}

  	// Previous period: same duration, immediately before this one
  	duration := thisEnd.Sub(thisStart) + time.Nanosecond
  	prevEnd := thisStart.Add(-time.Nanosecond)
  	prevStart := prevEnd.Add(-duration).Add(time.Nanosecond)

  	thisSummary, err := s.db.GetReviewSummaryForPeriod(thisStart, thisEnd)
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}
  	prevSummary, err := s.db.GetReviewSummaryForPeriod(prevStart, prevEnd)
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}

  	combined := map[string]any{
  		"type":       "comparison",
  		"period":     payload.Period,
  		"thisPeriod": thisSummary,
  		"prevPeriod": prevSummary,
  	}
  	combinedJSON, err := json.Marshal(combined)
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}

  	snapshot, err := s.db.CreateTypedSnapshotJSON(string(combinedJSON), "global_comparison", nil)
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}

  	task, reused, err := s.db.CreateAnalysisTask(payload.Provider, payload.Model, snapshot.ID)
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}
  	if !reused {
  		taskID := task.ID
  		_ = s.queue.Enqueue(jobs.Job{
  			Key:      jobs.AnalysisJobKey(taskID),
  			TaskType: models.TaskTypeAnalysis,
  			TaskID:   taskID,
  			Run: func(ctx context.Context) error {
  				return s.runAnalysisTask(ctx, taskID)
  			},
  		})
  	}
  	writeJSON(w, http.StatusAccepted, map[string]any{"task": task, "reused": reused})
  }
  ```

- [ ] **Step 3：编译验证**

  ```bash
  cd apps/server && go build ./...
  ```

- [ ] **Step 4：提交**

  ```bash
  git add internal/api/server.go
  git commit -m "feat(api): 新增 generate-comparison 环比分析端点"
  ```

---

## Task 6：`handleAnalysisGenerateProblem` — 单题分析端点

**Files:**
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1：实现 `handleAnalysisGenerateProblem`**

  在 `handleAnalysisGenerateComparison` 之后插入：

  ```go
  func (s *Server) handleAnalysisGenerateProblem(w http.ResponseWriter, r *http.Request) {
  	problemID, err := parseTaskID(r.PathValue("problemId")) // reuses the int64 parser
  	if err != nil || problemID <= 0 {
  		writeError(w, http.StatusBadRequest, "invalid problem id")
  		return
  	}

  	var payload struct {
  		Provider string `json:"provider"`
  		Model    string `json:"model"`
  	}
  	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
  		writeError(w, http.StatusBadRequest, "invalid json body")
  		return
  	}

  	settings, err := s.db.LoadAISettings()
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}
  	if payload.Provider == "" {
  		payload.Provider = settings.Provider
  	}
  	if payload.Model == "" {
  		payload.Model = settings.Model
  	}
  	if payload.Provider == "" || payload.Model == "" {
  		writeError(w, http.StatusBadRequest, "provider and model are required; configure AI settings first")
  		return
  	}

  	data, err := s.db.GetProblemAnalysisData(problemID)
  	if err != nil {
  		if errors.Is(err, sql.ErrNoRows) {
  			writeError(w, http.StatusNotFound, "problem not found")
  			return
  		}
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}
  	if len(data.Submissions) == 0 {
  		writeError(w, http.StatusBadRequest, "该题暂无提交记录，无法进行 AI 分析")
  		return
  	}

  	dataJSON, err := json.Marshal(data)
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}

  	snapshot, err := s.db.CreateTypedSnapshotJSON(string(dataJSON), "problem", &problemID)
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}

  	task, reused, err := s.db.CreateAnalysisTask(payload.Provider, payload.Model, snapshot.ID)
  	if err != nil {
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}
  	if !reused {
  		taskID := task.ID
  		_ = s.queue.Enqueue(jobs.Job{
  			Key:      jobs.AnalysisJobKey(taskID),
  			TaskType: models.TaskTypeAnalysis,
  			TaskID:   taskID,
  			Run: func(ctx context.Context) error {
  				return s.runAnalysisTask(ctx, taskID)
  			},
  		})
  	}
  	writeJSON(w, http.StatusAccepted, map[string]any{"task": task, "reused": reused})
  }
  ```

- [ ] **Step 2：检查 `errors` 和 `database/sql` 导入是否已有**

  ```bash
  head -20 apps/server/internal/api/server.go
  # 期望看到 "errors" 和 "database/sql" 在 import 块中
  ```

  若 `database/sql` 未导入，在 import 块中加入 `"database/sql"`。

- [ ] **Step 3：编译验证**

  ```bash
  cd apps/server && go build ./...
  ```

- [ ] **Step 4：手动验证**

  ```bash
  # 获取任意一个有提交记录的 problemId（从 /api/problems 取）
  curl -s http://localhost:38473/api/problems | jq '.[0].id'
  # 假设是 1
  curl -s -X POST http://localhost:38473/api/analysis/generate-problem/1 \
    -H "Content-Type: application/json" \
    -d '{}' | jq .task.status
  # 期望: "PENDING"

  # 无提交记录的题目应返回 400
  curl -s -X POST http://localhost:38473/api/analysis/generate-problem/99999 \
    -H "Content-Type: application/json" \
    -d '{}' | jq .error
  # 期望: "该题暂无提交记录，无法进行 AI 分析" 或 "problem not found"
  ```

- [ ] **Step 5：提交**

  ```bash
  git add internal/api/server.go
  git commit -m "feat(api): 新增 generate-problem 单题 AI 分析端点"
  ```

---

## Task 7：`handleAnalysisLatest` — 仪表盘用最新分析查询

**Files:**
- Modify: `apps/server/internal/api/server.go`

- [ ] **Step 1：实现 `handleAnalysisLatest`**

  在 `handleAnalysisTask` 之后插入：

  ```go
  func (s *Server) handleAnalysisLatest(w http.ResponseWriter, _ *http.Request) {
  	task, err := s.db.GetLatestGlobalAnalysisTask()
  	if err != nil {
  		if errors.Is(err, sql.ErrNoRows) {
  			w.WriteHeader(http.StatusNoContent)
  			return
  		}
  		writeError(w, http.StatusInternalServerError, err.Error())
  		return
  	}
  	writeJSON(w, http.StatusOK, task)
  }
  ```

- [ ] **Step 2：编译验证**

  ```bash
  cd apps/server && go build ./...
  ```

- [ ] **Step 3：手动验证**

  ```bash
  # 有历史分析时：
  curl -s http://localhost:38473/api/analysis/latest | jq .status
  # 期望: "SUCCESS"

  # 无历史分析时（全新数据库）：
  curl -v http://localhost:38473/api/analysis/latest
  # 期望: HTTP 204 No Content
  ```

- [ ] **Step 4：提交**

  ```bash
  git add internal/api/server.go
  git commit -m "feat(api): 新增 GET /api/analysis/latest 仪表盘用最新分析查询"
  ```

---

## Task 8：构建 Go 二进制并验证全部端点

- [ ] **Step 1：完整构建**

  ```bash
  cd apps/server
  go build -o bin/ojreviewd.exe ./cmd/ojreviewd
  ```
  期望：`bin/ojreviewd.exe` 生成，无报错。

- [ ] **Step 2：启动服务并执行端对端验证**

  ```bash
  ./bin/ojreviewd.exe --addr 0.0.0.0:38473 &
  SERVER_PID=$!

  # 全部新端点连通性检查
  echo "=== generate-comparison ===" && \
    curl -s -X POST http://localhost:38473/api/analysis/generate-comparison \
      -H "Content-Type: application/json" -d '{"period":"week"}' | jq .task.id

  echo "=== generate-problem/1 ===" && \
    curl -s -X POST http://localhost:38473/api/analysis/generate-problem/1 \
      -H "Content-Type: application/json" -d '{}' | jq .task.id

  echo "=== analysis/latest ===" && \
    curl -o /dev/null -w "%{http_code}" http://localhost:38473/api/analysis/latest

  kill $SERVER_PID
  ```

  期望：前两个返回包含 `task.id` 的 JSON（或 AI 未配置时返回带 `error` 的 400），第三个返回 200 或 204。

- [ ] **Step 3：将二进制复制到 Electron bin 目录**

  （WSL 环境下需要在 Windows 侧构建，参见 CLAUDE.md 中的"Go 服务构建（WSL 环境）"章节）

  ```bash
  cp apps/server/bin/ojreviewd.exe apps/desktop-electron/bin/ojreviewd.exe
  ```

- [ ] **Step 4：提交**

  ```bash
  git add apps/server/bin/ apps/desktop-electron/bin/
  git commit -m "build: 更新 ojreviewd 二进制（含 AI 分析新端点）"
  ```

---

## 自检

### Spec 覆盖

| 需求 | 任务 |
|---|---|
| snapshot 表加 snapshot_type / problem_id | Task 1 |
| GetReviewSummaryForPeriod | Task 2 |
| generate 端点支持 period | Task 3 |
| 环比合并两期进一个 snapshot | Task 5 |
| 单题分析端点 | Task 6 |
| GET /api/analysis/latest | Task 7 |

### 名称一致性

- `GetReviewSummaryForPeriod` — Task 2 定义，Task 3/5 使用 ✓
- `CreateTypedSnapshotJSON` — Task 4 定义，Task 5/6 使用 ✓
- `GetProblemAnalysisData` — Task 4 定义，Task 6 使用 ✓
- `GetLatestGlobalAnalysisTask` — Task 4 定义，Task 7 使用 ✓
- `parsePeriodBounds` — Task 3 定义，Task 3/5 使用 ✓
