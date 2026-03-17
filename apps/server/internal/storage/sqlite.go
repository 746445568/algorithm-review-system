package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
	"ojreviewdesktop/internal/app"
	cryptovault "ojreviewdesktop/internal/crypto"
	"ojreviewdesktop/internal/models"
)

const schemaVersion = 2

type DB struct {
	conn  *sql.DB
	cfg   app.Config
	vault *cryptovault.Vault
}

type SubmissionQueryOptions struct {
	PlatformAccountID *int64
	Platform          *models.Platform
	ProblemID         *int64
	Verdict           *models.Verdict
	Limit             int
	Offset            int
}

type ProblemQueryOptions struct {
	Platform *models.Platform
	TagName  string
	Search   string
	Limit    int
	Offset   int
}

type ContestQueryOptions struct {
	Platform *models.Platform
	Status   string
	Limit    int
	Offset   int
}

type ProblemSummary struct {
	ProblemID       int64
	ExternalProbID  string
	Title           string
	Platform        models.Platform
	AttemptCount    int
	ACCount         int
	LastSubmittedAt time.Time
	Tags            []string
}

func Open(cfg app.Config, vault *cryptovault.Vault) (*DB, error) {
	conn, err := sql.Open("sqlite", cfg.DBPath)
	if err != nil {
		return nil, err
	}
	if _, err := conn.Exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`); err != nil {
		conn.Close()
		return nil, err
	}
	return &DB{conn: conn, cfg: cfg, vault: vault}, nil
}

func (db *DB) Close() error { return db.conn.Close() }

func (db *DB) MigrateWithBackup() error {
	if _, err := os.Stat(db.cfg.DBPath); err == nil {
		backupPath := filepath.Join(db.cfg.DataDir, fmt.Sprintf("ojreview.pre-migration.%s.db", time.Now().UTC().Format("20060102-150405")))
		if err := copyFile(db.cfg.DBPath, backupPath); err != nil {
			return err
		}
	}
	if err := db.ensureSchema(); err != nil {
		return err
	}
	return nil
}

func (db *DB) ensureSchema() error {
	schema := `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS owner_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Owner',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  external_handle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_synced_at TEXT,
  last_cursor TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_handle)
);
CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  external_problem_id TEXT NOT NULL,
  external_contest_id TEXT,
  title TEXT NOT NULL,
  url TEXT,
  difficulty TEXT,
  raw_tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_problem_id)
);
CREATE TABLE IF NOT EXISTS problem_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL,
  tag_name TEXT NOT NULL,
  tag_source TEXT NOT NULL DEFAULT 'platform_raw',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(problem_id, tag_name, tag_source),
  FOREIGN KEY(problem_id) REFERENCES problems(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_account_id INTEGER,
  platform TEXT NOT NULL,
  external_submission_id TEXT NOT NULL,
  problem_id INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  language TEXT,
  submitted_at TEXT NOT NULL,
  exec_time_ms INTEGER,
  memory_kb INTEGER,
  source_contest_id TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_submission_id),
  FOREIGN KEY(platform_account_id) REFERENCES platform_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY(problem_id) REFERENCES problems(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sync_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_account_id INTEGER NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL,
  cursor_before TEXT,
  cursor_after TEXT,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY(platform_account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS review_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  summary_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS problem_review_states (
  problem_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'TODO',
  notes TEXT NOT NULL DEFAULT '',
  next_review_at TEXT,
  last_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(problem_id) REFERENCES problems(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS analysis_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_snapshot_id INTEGER NOT NULL,
  result_text TEXT,
  result_json TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS contests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  external_contest_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'UPCOMING',
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_contest_id)
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`
	if _, err := db.conn.Exec(schema); err != nil {
		return err
	}
	if _, err := db.conn.Exec(`INSERT OR IGNORE INTO owner_profile(id, name) VALUES (1, 'Owner')`); err != nil {
		return err
	}
	_, err := db.conn.Exec(`
INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, fmt.Sprintf("%d", schemaVersion))
	return err
}

func (db *DB) Owner() (models.OwnerProfile, error) {
	row := db.conn.QueryRow(`SELECT id, name, created_at FROM owner_profile WHERE id = 1`)
	return scanOwnerProfile(row)
}

func (db *DB) ListAccounts() ([]models.PlatformAccount, error) {
	rows, err := db.conn.Query(`SELECT id, platform, external_handle, status, last_synced_at, COALESCE(last_cursor,''), created_at, updated_at FROM platform_accounts ORDER BY platform, external_handle`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	accounts := make([]models.PlatformAccount, 0)
	for rows.Next() {
		item, err := scanPlatformAccount(rows)
		if err != nil {
			return nil, err
		}
		accounts = append(accounts, item)
	}
	return accounts, rows.Err()
}

func (db *DB) GetAccount(id int64) (models.PlatformAccount, error) {
	row := db.conn.QueryRow(`
SELECT id, platform, external_handle, status, last_synced_at, COALESCE(last_cursor,''), created_at, updated_at
FROM platform_accounts WHERE id = ?`, id)
	return scanPlatformAccount(row)
}

func (db *DB) DeleteAccount(id int64) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 删除关联的提交记录
	if _, err := tx.Exec(`DELETE FROM submissions WHERE platform_account_id = ?`, id); err != nil {
		return err
	}
	// 删除关联的同步任务
	if _, err := tx.Exec(`DELETE FROM sync_tasks WHERE platform_account_id = ?`, id); err != nil {
		return err
	}
	// 删除孤立的题目（没有任何提交记录引用的题目）
	if _, err := tx.Exec(`DELETE FROM problems WHERE id NOT IN (SELECT DISTINCT problem_id FROM submissions WHERE problem_id IS NOT NULL)`); err != nil {
		return err
	}
	// 删除账号本身
	if _, err := tx.Exec(`DELETE FROM platform_accounts WHERE id = ?`, id); err != nil {
		return err
	}

	return tx.Commit()
}

func (db *DB) UpsertAccount(platform models.Platform, handle string) (models.PlatformAccount, error) {
	_, err := db.conn.Exec(`
INSERT INTO platform_accounts(platform, external_handle, status)
VALUES (?, ?, 'ACTIVE')
ON CONFLICT(platform, external_handle) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`, platform, handle)
	if err != nil {
		return models.PlatformAccount{}, err
	}
	row := db.conn.QueryRow(`
SELECT id, platform, external_handle, status, last_synced_at, COALESCE(last_cursor,''), created_at, updated_at
FROM platform_accounts WHERE platform = ? AND external_handle = ?`, platform, handle)
	return scanPlatformAccount(row)
}

func (db *DB) UpsertProblem(p models.Problem) (models.Problem, error) {
	rawTagsJSON := strings.TrimSpace(p.RawTagsJSON)
	if rawTagsJSON == "" {
		rawTagsJSON = "[]"
	}

	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := db.conn.Begin()
	if err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: begin transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	_, err = tx.Exec(`
INSERT INTO problems(platform, external_problem_id, external_contest_id, title, url, difficulty, raw_tags_json, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(platform, external_problem_id) DO UPDATE SET
	external_contest_id = excluded.external_contest_id,
	title = excluded.title,
	url = excluded.url,
	difficulty = excluded.difficulty,
	raw_tags_json = excluded.raw_tags_json,
	updated_at = excluded.updated_at`,
		p.Platform,
		p.ExternalProblemID,
		nullableString(p.ExternalContestID),
		p.Title,
		nullableString(p.URL),
		nullableString(p.Difficulty),
		rawTagsJSON,
		now,
		now,
	)
	if err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: save problem row: %w", err)
	}

	row := tx.QueryRow(`
SELECT id, platform, external_problem_id, COALESCE(external_contest_id, ''), title, COALESCE(url, ''), COALESCE(difficulty, ''), raw_tags_json, created_at, updated_at
FROM problems
WHERE platform = ? AND external_problem_id = ?`, p.Platform, p.ExternalProblemID)

	saved, err := scanProblemRecord(row)
	if err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: fetch saved problem: %w", err)
	}

	tags, err := parseRawTags(rawTagsJSON)
	if err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: parse raw_tags_json: %w", err)
	}

	for _, tag := range tags {
		if _, err = tx.Exec(`
INSERT INTO problem_tags(problem_id, tag_name, tag_source, created_at)
VALUES (?, ?, 'platform_raw', ?)
ON CONFLICT(problem_id, tag_name, tag_source) DO NOTHING`, saved.ID, tag, now); err != nil {
			return models.Problem{}, fmt.Errorf("upsert problem: upsert problem tag %q: %w", tag, err)
		}
	}

	if err = tx.Commit(); err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: commit transaction: %w", err)
	}

	return saved, nil
}

func (db *DB) UpsertSubmission(s models.Submission) (models.Submission, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	submittedAt := s.SubmittedAt.UTC().Format(time.RFC3339)

	_, err := db.conn.Exec(`
INSERT INTO submissions(platform_account_id, platform, external_submission_id, problem_id, verdict, language, submitted_at, exec_time_ms, memory_kb, source_contest_id, raw_json, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(platform, external_submission_id) DO UPDATE SET
	verdict = excluded.verdict,
	language = excluded.language,
	exec_time_ms = excluded.exec_time_ms,
	memory_kb = excluded.memory_kb,
	raw_json = excluded.raw_json,
	updated_at = excluded.updated_at`,
		nullableInt64Ptr(s.PlatformAccountID),
		s.Platform,
		s.ExternalSubmissionID,
		s.ProblemID,
		s.Verdict,
		nullableString(s.Language),
		submittedAt,
		nullableIntPtr(s.ExecutionTimeMS),
		nullableIntPtr(s.MemoryKB),
		nullableString(s.SourceContestID),
		s.RawJSON,
		now,
		now,
	)
	if err != nil {
		return models.Submission{}, fmt.Errorf("upsert submission: save submission row: %w", err)
	}

	row := db.conn.QueryRow(`
SELECT id, platform_account_id, platform, external_submission_id, problem_id, verdict, COALESCE(language, ''), submitted_at, exec_time_ms, memory_kb, COALESCE(source_contest_id, ''), raw_json, created_at, updated_at
FROM submissions
WHERE platform = ? AND external_submission_id = ?`, s.Platform, s.ExternalSubmissionID)

	saved, err := scanSubmissionRecord(row)
	if err != nil {
		return models.Submission{}, fmt.Errorf("upsert submission: fetch saved submission: %w", err)
	}
	return saved, nil
}

func (db *DB) GetSubmissions(opts SubmissionQueryOptions) ([]models.Submission, error) {
	var conditions []string
	args := make([]any, 0)

	if opts.PlatformAccountID != nil {
		conditions = append(conditions, "platform_account_id = ?")
		args = append(args, *opts.PlatformAccountID)
	}
	if opts.Platform != nil {
		conditions = append(conditions, "platform = ?")
		args = append(args, *opts.Platform)
	}
	if opts.ProblemID != nil {
		conditions = append(conditions, "problem_id = ?")
		args = append(args, *opts.ProblemID)
	}
	if opts.Verdict != nil {
		conditions = append(conditions, "verdict = ?")
		args = append(args, *opts.Verdict)
	}

	query := `
SELECT id, platform_account_id, platform, external_submission_id, problem_id, verdict, COALESCE(language, ''), submitted_at, exec_time_ms, memory_kb, COALESCE(source_contest_id, ''), raw_json, created_at, updated_at
FROM submissions`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY submitted_at DESC, id DESC"
	if opts.Limit > 0 {
		query += " LIMIT ?"
		args = append(args, opts.Limit)
		if opts.Offset > 0 {
			query += " OFFSET ?"
			args = append(args, opts.Offset)
		}
	} else if opts.Offset > 0 {
		query += " LIMIT -1 OFFSET ?"
		args = append(args, opts.Offset)
	}

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("get submissions: query rows: %w", err)
	}
	defer rows.Close()

	items := make([]models.Submission, 0)
	for rows.Next() {
		item, err := scanSubmissionRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("get submissions: scan row: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get submissions: iterate rows: %w", err)
	}

	return items, nil
}

func (db *DB) GetProblems(opts ProblemQueryOptions) ([]models.Problem, error) {
	var conditions []string
	args := make([]any, 0)

	if opts.Platform != nil {
		conditions = append(conditions, "p.platform = ?")
		args = append(args, *opts.Platform)
	}
	if strings.TrimSpace(opts.TagName) != "" {
		conditions = append(conditions, "EXISTS (SELECT 1 FROM problem_tags pt WHERE pt.problem_id = p.id AND pt.tag_name = ?)")
		args = append(args, strings.TrimSpace(opts.TagName))
	}
	if strings.TrimSpace(opts.Search) != "" {
		conditions = append(conditions, "p.title LIKE ?")
		args = append(args, "%"+strings.TrimSpace(opts.Search)+"%")
	}

	query := `
SELECT p.id, p.platform, p.external_problem_id, COALESCE(p.external_contest_id, ''), p.title, COALESCE(p.url, ''), COALESCE(p.difficulty, ''), p.raw_tags_json, p.created_at, p.updated_at
FROM problems p`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY p.updated_at DESC, p.id DESC"
	if opts.Limit > 0 {
		query += " LIMIT ?"
		args = append(args, opts.Limit)
		if opts.Offset > 0 {
			query += " OFFSET ?"
			args = append(args, opts.Offset)
		}
	} else if opts.Offset > 0 {
		query += " LIMIT -1 OFFSET ?"
		args = append(args, opts.Offset)
	}

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("get problems: query rows: %w", err)
	}
	defer rows.Close()

	items := make([]models.Problem, 0)
	for rows.Next() {
		item, err := scanProblemRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("get problems: scan row: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get problems: iterate rows: %w", err)
	}

	return items, nil
}

func (db *DB) UpsertContest(c models.Contest) (models.Contest, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	startTime := c.StartTime.UTC().Format(time.RFC3339)
	_, err := db.conn.Exec(`
INSERT INTO contests(platform, external_contest_id, name, start_time, duration_minutes, url, status, last_synced_at, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(platform, external_contest_id) DO UPDATE SET
	name = excluded.name,
	start_time = excluded.start_time,
	duration_minutes = excluded.duration_minutes,
	url = excluded.url,
	status = excluded.status,
	last_synced_at = excluded.last_synced_at,
	updated_at = excluded.updated_at`,
		c.Platform,
		c.ExternalContestID,
		c.Name,
		startTime,
		c.DurationMinutes,
		nullableString(c.URL),
		c.Status,
		now,
		now,
		now,
	)
	if err != nil {
		return models.Contest{}, fmt.Errorf("upsert contest: save contest row: %w", err)
	}

	row := db.conn.QueryRow(`
SELECT id, platform, external_contest_id, name, start_time, duration_minutes, COALESCE(url, ''), status, created_at, updated_at, last_synced_at
FROM contests
WHERE platform = ? AND external_contest_id = ?`, c.Platform, c.ExternalContestID)
	return scanContestRecord(row)
}

func (db *DB) GetContests(opts ContestQueryOptions) ([]models.Contest, error) {
	var conditions []string
	args := make([]any, 0)

	if opts.Platform != nil {
		conditions = append(conditions, "platform = ?")
		args = append(args, *opts.Platform)
	}
	if strings.TrimSpace(opts.Status) != "" {
		conditions = append(conditions, "status = ?")
		args = append(args, strings.TrimSpace(strings.ToUpper(opts.Status)))
	}

	query := `
SELECT id, platform, external_contest_id, name, start_time, duration_minutes, COALESCE(url, ''), status, created_at, updated_at, last_synced_at
FROM contests`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY start_time ASC, id ASC"
	if opts.Limit > 0 {
		query += " LIMIT ?"
		args = append(args, opts.Limit)
		if opts.Offset > 0 {
			query += " OFFSET ?"
			args = append(args, opts.Offset)
		}
	}

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("get contests: query rows: %w", err)
	}
	defer rows.Close()

	items := make([]models.Contest, 0)
	for rows.Next() {
		item, err := scanContestRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("get contests: scan row: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (db *DB) GetProblemSubmissionsSummary(platformAccountID int64) ([]ProblemSummary, error) {
	rows, err := db.conn.Query(`
SELECT
	p.id,
	p.external_problem_id,
	p.title,
	p.platform,
	COUNT(s.id) AS attempt_count,
	SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count,
	MAX(s.submitted_at) AS last_submitted_at,
	COALESCE(GROUP_CONCAT(DISTINCT pt.tag_name), '') AS tags_csv
FROM submissions s
JOIN problems p ON p.id = s.problem_id
LEFT JOIN problem_tags pt ON pt.problem_id = p.id
WHERE s.platform_account_id = ?
GROUP BY p.id, p.external_problem_id, p.title, p.platform
ORDER BY last_submitted_at DESC, p.id DESC`, models.VerdictAC, platformAccountID)
	if err != nil {
		return nil, fmt.Errorf("get problem submissions summary: query rows: %w", err)
	}
	defer rows.Close()

	items := make([]ProblemSummary, 0)
	for rows.Next() {
		var item ProblemSummary
		var lastSubmittedAtRaw string
		var tagsCSV string
		if err := rows.Scan(
			&item.ProblemID,
			&item.ExternalProbID,
			&item.Title,
			&item.Platform,
			&item.AttemptCount,
			&item.ACCount,
			&lastSubmittedAtRaw,
			&tagsCSV,
		); err != nil {
			return nil, fmt.Errorf("get problem submissions summary: scan row: %w", err)
		}

		item.LastSubmittedAt, err = parseSQLiteTimestamp(lastSubmittedAtRaw)
		if err != nil {
			return nil, fmt.Errorf("get problem submissions summary: parse last_submitted_at: %w", err)
		}
		item.Tags = splitTagsCSV(tagsCSV)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get problem submissions summary: iterate rows: %w", err)
	}

	return items, nil
}

func (db *DB) UpdateAccountCursor(accountID int64, cursor string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := db.conn.Exec(`
UPDATE platform_accounts
SET last_cursor = ?, last_synced_at = ?, updated_at = ?
WHERE id = ?`, cursor, now, now, accountID)
	if err != nil {
		return fmt.Errorf("update account cursor: update account %d: %w", accountID, err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("update account cursor: read rows affected: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("update account cursor: account %d not found", accountID)
	}

	return nil
}

func (db *DB) CreateSyncTask(platformAccountID int64, cursorBefore string) (models.SyncTask, error) {
	if err := db.ensureNoRunningSyncTask(platformAccountID); err != nil {
		return models.SyncTask{}, err
	}
	_, err := db.conn.Exec(`
INSERT INTO sync_tasks(platform_account_id, task_type, status, cursor_before)
VALUES (?, ?, ?, ?)`, platformAccountID, models.TaskTypeSync, models.TaskPending, cursorBefore)
	if err != nil {
		return models.SyncTask{}, err
	}
	return db.GetLastSyncTask()
}

func (db *DB) GetLastSyncTask() (models.SyncTask, error) {
	row := db.conn.QueryRow(`
SELECT id, platform_account_id, task_type, status, COALESCE(cursor_before,''), COALESCE(cursor_after,''), fetched_count, inserted_count, retry_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM sync_tasks WHERE id = last_insert_rowid()`)
	return scanSyncTask(row)
}

func (db *DB) ListSyncTasks() ([]models.SyncTask, error) {
	rows, err := db.conn.Query(`
SELECT id, platform_account_id, task_type, status, COALESCE(cursor_before,''), COALESCE(cursor_after,''), fetched_count, inserted_count, retry_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM sync_tasks ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.SyncTask, 0)
	for rows.Next() {
		task, err := scanSyncTask(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, task)
	}
	return items, rows.Err()
}

func (db *DB) MarkSyncTaskRunning(taskID int64) error {
	_, err := db.conn.Exec(`UPDATE sync_tasks SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?`, models.TaskRunning, taskID)
	return err
}

func (db *DB) UpdateSyncTaskProgress(taskID int64, fetched, inserted int, cursorAfter string) error {
	_, err := db.conn.Exec(`
UPDATE sync_tasks
SET fetched_count = ?, inserted_count = ?, cursor_after = ?
WHERE id = ?`, fetched, inserted, cursorAfter, taskID)
	return err
}

func (db *DB) MarkSyncTaskFinished(taskID int64, status models.TaskStatus, fetched, inserted int, message string) error {
	_, err := db.conn.Exec(`
UPDATE sync_tasks
SET status = ?, fetched_count = ?, inserted_count = ?, error_message = ?, cursor_after = (
	SELECT COALESCE(pa.last_cursor, '')
	FROM platform_accounts pa
	JOIN sync_tasks st ON st.platform_account_id = pa.id
	WHERE st.id = ?
), finished_at = CURRENT_TIMESTAMP
WHERE id = ?`, status, fetched, inserted, message, taskID, taskID)
	return err
}

func (db *DB) CreateReviewSnapshot(summary map[string]any) (models.ReviewSnapshot, error) {
	bytes, err := json.Marshal(summary)
	if err != nil {
		return models.ReviewSnapshot{}, err
	}
	_, err = db.conn.Exec(`INSERT INTO review_snapshots(summary_json) VALUES (?)`, string(bytes))
	if err != nil {
		return models.ReviewSnapshot{}, err
	}
	row := db.conn.QueryRow(`SELECT id, generated_at, summary_json FROM review_snapshots WHERE id = last_insert_rowid()`)
	return scanReviewSnapshot(row)
}

func (db *DB) GetReviewSnapshot(id int64) (models.ReviewSnapshot, error) {
	row := db.conn.QueryRow(`SELECT id, generated_at, summary_json FROM review_snapshots WHERE id = ?`, id)
	return scanReviewSnapshot(row)
}

func (db *DB) GetProblemReviewState(problemID int64) (models.ProblemReviewState, error) {
	row := db.conn.QueryRow(`
SELECT problem_id, status, notes, next_review_at, last_updated_at
FROM problem_review_states
WHERE problem_id = ?`, problemID)

	state, err := scanProblemReviewState(row)
	if err == nil {
		return state, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return models.ProblemReviewState{}, err
	}

	return models.ProblemReviewState{
		ProblemID:     problemID,
		Status:        models.ReviewStatusTodo,
		Notes:         "",
		LastUpdatedAt: time.Now().UTC(),
	}, nil
}

func (db *DB) SaveProblemReviewState(state models.ProblemReviewState) (models.ProblemReviewState, error) {
	if state.ProblemID == 0 {
		return models.ProblemReviewState{}, errors.New("problem id is required")
	}

	status := normalizeReviewStatus(state.Status)
	notes := strings.TrimSpace(state.Notes)
	var nextReviewAt any
	if state.NextReviewAt != nil && !state.NextReviewAt.IsZero() {
		nextReviewAt = state.NextReviewAt.UTC().Format(time.RFC3339)
	}

	_, err := db.conn.Exec(`
INSERT INTO problem_review_states(problem_id, status, notes, next_review_at, last_updated_at)
VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(problem_id) DO UPDATE SET
	status = excluded.status,
	notes = excluded.notes,
	next_review_at = excluded.next_review_at,
	last_updated_at = CURRENT_TIMESTAMP`,
		state.ProblemID,
		status,
		notes,
		nextReviewAt,
	)
	if err != nil {
		return models.ProblemReviewState{}, err
	}

	return db.GetProblemReviewState(state.ProblemID)
}

func (db *DB) CreateAnalysisTask(provider, model string, snapshotID int64) (models.AnalysisTask, bool, error) {
	existing, err := db.findReusableAnalysisTask(snapshotID, provider, model)
	if err == nil {
		return existing, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return models.AnalysisTask{}, false, err
	}
	_, err = db.conn.Exec(`
INSERT INTO analysis_tasks(status, provider, model, input_snapshot_id)
VALUES (?, ?, ?, ?)`, models.TaskPending, provider, model, snapshotID)
	if err != nil {
		return models.AnalysisTask{}, false, err
	}
	task, err := db.GetLastAnalysisTask()
	return task, false, err
}

func (db *DB) GetLastAnalysisTask() (models.AnalysisTask, error) {
	row := db.conn.QueryRow(`
SELECT id, status, provider, model, input_snapshot_id, COALESCE(result_text,''), COALESCE(result_json,''), COALESCE(error_message,''), retry_count, created_at, updated_at
FROM analysis_tasks WHERE id = last_insert_rowid()`)
	return scanAnalysisTask(row)
}

func (db *DB) GetAnalysisTask(id int64) (models.AnalysisTask, error) {
	row := db.conn.QueryRow(`
SELECT id, status, provider, model, input_snapshot_id, COALESCE(result_text,''), COALESCE(result_json,''), COALESCE(error_message,''), retry_count, created_at, updated_at
FROM analysis_tasks WHERE id = ?`, id)
	return scanAnalysisTask(row)
}

func (db *DB) MarkAnalysisTaskRunning(taskID int64) error {
	_, err := db.conn.Exec(`UPDATE analysis_tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, models.TaskRunning, taskID)
	return err
}

func (db *DB) MarkAnalysisTaskFinished(taskID int64, status models.TaskStatus, resultText, resultJSON, message string) error {
	_, err := db.conn.Exec(`
UPDATE analysis_tasks
SET status = ?, result_text = ?, result_json = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?`, status, resultText, resultJSON, message, taskID)
	return err
}

func (db *DB) SaveAISettings(settings models.AISettings) error {
	apiKeyCipher := ""
	if settings.APIKey != "" {
		encrypted, err := db.vault.Encrypt(settings.APIKey)
		if err != nil {
			return err
		}
		apiKeyCipher = encrypted
	}
	payload := map[string]string{
		"provider": settings.Provider,
		"model":    settings.Model,
		"baseUrl":  settings.BaseURL,
		"apiKey":   apiKeyCipher,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = db.conn.Exec(`
INSERT INTO app_settings(key, value) VALUES ('ai_settings', ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, string(body))
	return err
}

func (db *DB) LoadAISettings() (models.AISettings, error) {
	row := db.conn.QueryRow(`SELECT value FROM app_settings WHERE key = 'ai_settings'`)
	var raw string
	if err := row.Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.AISettings{}, nil
		}
		return models.AISettings{}, err
	}
	var payload map[string]string
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return models.AISettings{}, err
	}
	apiKey := ""
	if payload["apiKey"] != "" {
		decrypted, err := db.vault.Decrypt(payload["apiKey"])
		if err != nil {
			return models.AISettings{}, err
		}
		apiKey = decrypted
	}
	return models.AISettings{
		Provider: payload["provider"],
		Model:    payload["model"],
		BaseURL:  payload["baseUrl"],
		APIKey:   apiKey,
	}, nil
}

func (db *DB) SaveThemeMode(mode string) error {
	mode = strings.TrimSpace(strings.ToLower(mode))
	if mode == "" {
		mode = "follow-system"
	}
	_, err := db.conn.Exec(`
INSERT INTO app_settings(key, value) VALUES ('theme_mode', ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, mode)
	return err
}

func (db *DB) LoadThemeMode() (string, error) {
	row := db.conn.QueryRow(`SELECT value FROM app_settings WHERE key = 'theme_mode'`)
	var mode string
	if err := row.Scan(&mode); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "follow-system", nil
		}
		return "", err
	}
	mode = strings.TrimSpace(strings.ToLower(mode))
	if mode == "" {
		mode = "follow-system"
	}
	return mode, nil
}

func (db *DB) ExportDiagnostics() (string, error) {
	diagPath := filepath.Join(db.cfg.ExportDir, fmt.Sprintf("diagnostics-%s.json", time.Now().UTC().Format("20060102-150405")))
	payload := map[string]any{
		"generatedAt": time.Now().UTC(),
		"schema":      schemaVersion,
		"dataDir":     db.cfg.DataDir,
		"logDir":      db.cfg.LogDir,
	}
	bytes, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(diagPath, bytes, 0o644); err != nil {
		return "", err
	}
	return diagPath, nil
}

func (db *DB) ListRecoverableTasks() ([]models.SyncTask, error) {
	rows, err := db.conn.Query(`
SELECT id, platform_account_id, task_type, status, COALESCE(cursor_before,''), COALESCE(cursor_after,''), fetched_count, inserted_count, retry_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM sync_tasks WHERE status IN (?, ?) ORDER BY created_at ASC`, models.TaskPending, models.TaskRunning)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.SyncTask, 0)
	for rows.Next() {
		task, err := scanSyncTask(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, task)
	}
	return items, rows.Err()
}

func (db *DB) ListRecoverableAnalysisTasks() ([]models.AnalysisTask, error) {
	rows, err := db.conn.Query(`
SELECT id, status, provider, model, input_snapshot_id, COALESCE(result_text,''), COALESCE(result_json,''), COALESCE(error_message,''), retry_count, created_at, updated_at
FROM analysis_tasks WHERE status IN (?, ?) ORDER BY created_at ASC`, models.TaskPending, models.TaskRunning)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.AnalysisTask, 0)
	for rows.Next() {
		task, err := scanAnalysisTask(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, task)
	}
	return items, rows.Err()
}

func (db *DB) GetSyncTask(id int64) (models.SyncTask, error) {
	row := db.conn.QueryRow(`
SELECT id, platform_account_id, task_type, status, COALESCE(cursor_before,''), COALESCE(cursor_after,''), fetched_count, inserted_count, retry_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM sync_tasks WHERE id = ?`, id)
	return scanSyncTask(row)
}

func (db *DB) ensureNoRunningSyncTask(platformAccountID int64) error {
	row := db.conn.QueryRow(`SELECT COUNT(1) FROM sync_tasks WHERE platform_account_id = ? AND status = ?`, platformAccountID, models.TaskRunning)
	var count int
	if err := row.Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return errors.New("sync task already running for this account")
	}
	return nil
}

func (db *DB) findReusableAnalysisTask(snapshotID int64, provider, model string) (models.AnalysisTask, error) {
	row := db.conn.QueryRow(`
SELECT id, status, provider, model, input_snapshot_id, COALESCE(result_text,''), COALESCE(result_json,''), COALESCE(error_message,''), retry_count, created_at, updated_at
FROM analysis_tasks
WHERE input_snapshot_id = ? AND provider = ? AND model = ? AND created_at >= datetime('now', '-10 minutes')
ORDER BY created_at DESC LIMIT 1`, snapshotID, provider, model)
	return scanAnalysisTask(row)
}

func scanSyncTask(scanner interface{ Scan(dest ...any) error }) (models.SyncTask, error) {
	var task models.SyncTask
	var createdAtRaw string
	var startedAtRaw sql.NullString
	var finishedAtRaw sql.NullString
	err := scanner.Scan(&task.ID, &task.PlatformAccountID, &task.TaskType, &task.Status, &task.CursorBefore, &task.CursorAfter, &task.FetchedCount, &task.InsertedCount, &task.RetryCount, &task.ErrorMessage, &createdAtRaw, &startedAtRaw, &finishedAtRaw)
	if err != nil {
		return task, err
	}
	task.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return task, fmt.Errorf("parse sync task created_at: %w", err)
	}
	if startedAtRaw.Valid {
		parsed, parseErr := parseSQLiteTimestamp(startedAtRaw.String)
		if parseErr != nil {
			return task, fmt.Errorf("parse sync task started_at: %w", parseErr)
		}
		task.StartedAt = &parsed
	}
	if finishedAtRaw.Valid {
		parsed, parseErr := parseSQLiteTimestamp(finishedAtRaw.String)
		if parseErr != nil {
			return task, fmt.Errorf("parse sync task finished_at: %w", parseErr)
		}
		task.FinishedAt = &parsed
	}
	return task, nil
}

func scanAnalysisTask(scanner interface{ Scan(dest ...any) error }) (models.AnalysisTask, error) {
	var task models.AnalysisTask
	var createdAtRaw string
	var updatedAtRaw string
	err := scanner.Scan(&task.ID, &task.Status, &task.Provider, &task.Model, &task.InputSnapshotID, &task.ResultText, &task.ResultJSON, &task.ErrorMessage, &task.RetryCount, &createdAtRaw, &updatedAtRaw)
	if err != nil {
		return task, err
	}
	task.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return task, fmt.Errorf("parse analysis task created_at: %w", err)
	}
	task.UpdatedAt, err = parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return task, fmt.Errorf("parse analysis task updated_at: %w", err)
	}
	return task, nil
}

func scanOwnerProfile(scanner interface{ Scan(dest ...any) error }) (models.OwnerProfile, error) {
	var owner models.OwnerProfile
	var createdAtRaw string
	if err := scanner.Scan(&owner.ID, &owner.Name, &createdAtRaw); err != nil {
		return owner, err
	}
	createdAt, err := parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return owner, fmt.Errorf("parse owner created_at: %w", err)
	}
	owner.CreatedAt = createdAt
	return owner, nil
}

func scanPlatformAccount(scanner interface{ Scan(dest ...any) error }) (models.PlatformAccount, error) {
	var item models.PlatformAccount
	var lastSyncedAtRaw sql.NullString
	var createdAtRaw string
	var updatedAtRaw string
	if err := scanner.Scan(&item.ID, &item.Platform, &item.ExternalHandle, &item.Status, &lastSyncedAtRaw, &item.LastCursor, &createdAtRaw, &updatedAtRaw); err != nil {
		return item, err
	}
	if lastSyncedAtRaw.Valid && strings.TrimSpace(lastSyncedAtRaw.String) != "" {
		parsed, err := parseSQLiteTimestamp(lastSyncedAtRaw.String)
		if err != nil {
			return item, fmt.Errorf("parse account last_synced_at: %w", err)
		}
		value := parsed
		item.LastSyncedAt = &value
	}
	createdAt, err := parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse account created_at: %w", err)
	}
	updatedAt, err := parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse account updated_at: %w", err)
	}
	item.CreatedAt = createdAt
	item.UpdatedAt = updatedAt
	return item, nil
}

func scanReviewSnapshot(scanner interface{ Scan(dest ...any) error }) (models.ReviewSnapshot, error) {
	var snapshot models.ReviewSnapshot
	var generatedAtRaw string
	if err := scanner.Scan(&snapshot.ID, &generatedAtRaw, &snapshot.SummaryJSON); err != nil {
		return snapshot, err
	}
	generatedAt, err := parseSQLiteTimestamp(generatedAtRaw)
	if err != nil {
		return snapshot, fmt.Errorf("parse review snapshot generated_at: %w", err)
	}
	snapshot.GeneratedAt = generatedAt
	return snapshot, nil
}

func scanProblemReviewState(scanner interface{ Scan(dest ...any) error }) (models.ProblemReviewState, error) {
	var state models.ProblemReviewState
	var nextReviewAtRaw sql.NullString
	var lastUpdatedAtRaw string
	if err := scanner.Scan(&state.ProblemID, &state.Status, &state.Notes, &nextReviewAtRaw, &lastUpdatedAtRaw); err != nil {
		return state, err
	}

	lastUpdatedAt, err := parseSQLiteTimestamp(lastUpdatedAtRaw)
	if err != nil {
		return state, fmt.Errorf("parse review state last_updated_at: %w", err)
	}
	state.LastUpdatedAt = lastUpdatedAt

	if nextReviewAtRaw.Valid && strings.TrimSpace(nextReviewAtRaw.String) != "" {
		parsed, err := parseSQLiteTimestamp(nextReviewAtRaw.String)
		if err != nil {
			return state, fmt.Errorf("parse review state next_review_at: %w", err)
		}
		state.NextReviewAt = &parsed
	}

	return state, nil
}

func scanContestRecord(scanner interface{ Scan(dest ...any) error }) (models.Contest, error) {
	var item models.Contest
	var startTimeRaw string
	var createdAtRaw string
	var updatedAtRaw string
	var lastSyncedAtRaw string
	if err := scanner.Scan(
		&item.ID,
		&item.Platform,
		&item.ExternalContestID,
		&item.Name,
		&startTimeRaw,
		&item.DurationMinutes,
		&item.URL,
		&item.Status,
		&createdAtRaw,
		&updatedAtRaw,
		&lastSyncedAtRaw,
	); err != nil {
		return item, err
	}
	startTime, err := parseSQLiteTimestamp(startTimeRaw)
	if err != nil {
		return item, fmt.Errorf("parse contest start_time: %w", err)
	}
	createdAt, err := parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse contest created_at: %w", err)
	}
	updatedAt, err := parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse contest updated_at: %w", err)
	}
	lastSyncedAt, err := parseSQLiteTimestamp(lastSyncedAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse contest last_synced_at: %w", err)
	}
	item.StartTime = startTime
	item.CreatedAt = createdAt
	item.UpdatedAt = updatedAt
	item.LastSyncedAt = &lastSyncedAt
	return item, nil
}

func scanProblemRecord(scanner interface{ Scan(dest ...any) error }) (models.Problem, error) {
	var item models.Problem
	var createdAtRaw string
	var updatedAtRaw string

	err := scanner.Scan(
		&item.ID,
		&item.Platform,
		&item.ExternalProblemID,
		&item.ExternalContestID,
		&item.Title,
		&item.URL,
		&item.Difficulty,
		&item.RawTagsJSON,
		&createdAtRaw,
		&updatedAtRaw,
	)
	if err != nil {
		return models.Problem{}, err
	}

	item.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return models.Problem{}, fmt.Errorf("parse created_at: %w", err)
	}
	item.UpdatedAt, err = parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return models.Problem{}, fmt.Errorf("parse updated_at: %w", err)
	}

	return item, nil
}

func scanSubmissionRecord(scanner interface{ Scan(dest ...any) error }) (models.Submission, error) {
	var item models.Submission
	var platformAccountID sql.NullInt64
	var executionTimeMS sql.NullInt64
	var memoryKB sql.NullInt64
	var submittedAtRaw string
	var createdAtRaw string
	var updatedAtRaw string

	err := scanner.Scan(
		&item.ID,
		&platformAccountID,
		&item.Platform,
		&item.ExternalSubmissionID,
		&item.ProblemID,
		&item.Verdict,
		&item.Language,
		&submittedAtRaw,
		&executionTimeMS,
		&memoryKB,
		&item.SourceContestID,
		&item.RawJSON,
		&createdAtRaw,
		&updatedAtRaw,
	)
	if err != nil {
		return models.Submission{}, err
	}

	if platformAccountID.Valid {
		item.PlatformAccountID = &platformAccountID.Int64
	}
	if executionTimeMS.Valid {
		value := int(executionTimeMS.Int64)
		item.ExecutionTimeMS = &value
	}
	if memoryKB.Valid {
		value := int(memoryKB.Int64)
		item.MemoryKB = &value
	}

	item.SubmittedAt, err = parseSQLiteTimestamp(submittedAtRaw)
	if err != nil {
		return models.Submission{}, fmt.Errorf("parse submitted_at: %w", err)
	}
	item.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return models.Submission{}, fmt.Errorf("parse created_at: %w", err)
	}
	item.UpdatedAt, err = parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return models.Submission{}, fmt.Errorf("parse updated_at: %w", err)
	}

	return item, nil
}

func parseRawTags(raw string) ([]string, error) {
	var parsed []any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(parsed))
	tags := make([]string, 0, len(parsed))
	for _, token := range parsed {
		tag := strings.TrimSpace(fmt.Sprint(token))
		if tag == "" {
			continue
		}
		if _, exists := seen[tag]; exists {
			continue
		}
		seen[tag] = struct{}{}
		tags = append(tags, tag)
	}

	return tags, nil
}

func parseSQLiteTimestamp(raw string) (time.Time, error) {
	if strings.TrimSpace(raw) == "" {
		return time.Time{}, errors.New("empty timestamp")
	}

	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
	}
	for _, layout := range layouts {
		if ts, err := time.Parse(layout, raw); err == nil {
			return ts.UTC(), nil
		}
	}

	return time.Time{}, fmt.Errorf("unsupported timestamp format: %q", raw)
}

func splitTagsCSV(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	parts := strings.Split(raw, ",")
	seen := make(map[string]struct{}, len(parts))
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		tag := strings.TrimSpace(part)
		if tag == "" {
			continue
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		out = append(out, tag)
	}
	return out
}

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func nullableIntPtr(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableInt64Ptr(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func copyFile(src, dst string) error {
	input, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, input, 0o644)
}

// GetReviewSummary aggregates review statistics
func (db *DB) GetReviewSummary() (map[string]any, error) {
	summary := map[string]any{
		"totalSubmissions":    0,
		"acRate":              0.0,
		"weakTags":            []map[string]any{},
		"repeatedFailures":    []map[string]any{},
		"recentUnsolved":      []map[string]any{},
		"problemSummaries":    []map[string]any{},
		"contestGroups":       []map[string]any{},
		"reviewStatusCounts":  map[string]int{},
		"dueReviewCount":      0,
		"scheduledReviewCount": 0,
	}

	// 1. totalSubmissions + acRate
	var totalSubmissions int
	var acCount int
	if err := db.conn.QueryRow(`
		SELECT
			COUNT(*) AS total_submissions,
			COALESCE(SUM(CASE WHEN verdict = ? THEN 1 ELSE 0 END), 0) AS ac_count
		FROM submissions`, models.VerdictAC).Scan(&totalSubmissions, &acCount); err != nil {
		return nil, fmt.Errorf("get review summary: query totals: %w", err)
	}
	summary["totalSubmissions"] = totalSubmissions
	if totalSubmissions > 0 {
		acRate := (float64(acCount) * 100.0) / float64(totalSubmissions)
		summary["acRate"] = math.Round(acRate*10) / 10
	}

	// 2. weakTags: top 5 lowest AC rate, min 3 attempts
	weakTagRows, err := db.conn.Query(`
		SELECT
			pt.tag_name,
			COUNT(*) AS attempts,
			SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count
		FROM problem_tags pt
		JOIN submissions s ON s.problem_id = pt.problem_id
		GROUP BY pt.tag_name
		HAVING COUNT(*) >= 3
		ORDER BY (SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) ASC
		LIMIT 5`, models.VerdictAC, models.VerdictAC)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query weak tags: %w", err)
	}
	defer weakTagRows.Close()

	weakTags := make([]map[string]any, 0, 5)
	for weakTagRows.Next() {
		var tagName string
		var attempts int
		var tagAC int
		if err := weakTagRows.Scan(&tagName, &attempts, &tagAC); err != nil {
			return nil, fmt.Errorf("get review summary: scan weak tags row: %w", err)
		}
		acRate := 0.0
		if attempts > 0 {
			acRate = math.Round(((float64(tagAC)*100.0/float64(attempts))*10)) / 10
		}
		weakTags = append(weakTags, map[string]any{
			"tag":      tagName,
			"attempts": attempts,
			"acCount":  tagAC,
			"acRate":   acRate,
		})
	}
	summary["weakTags"] = weakTags

	// 3. repeatedFailures: >=3 WA/RE/TLE and no AC
	repeatedRows, err := db.conn.Query(`
		SELECT
			s.problem_id,
			p.external_problem_id,
			p.title,
			COUNT(*) AS failed_count
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		WHERE s.verdict IN (?, ?, ?)
		GROUP BY s.problem_id, p.external_problem_id, p.title
		HAVING COUNT(*) >= 3
		AND NOT EXISTS (
			SELECT 1 FROM submissions s2
			WHERE s2.problem_id = s.problem_id AND s2.verdict = ?
		)
		ORDER BY failed_count DESC
		LIMIT 20`, models.VerdictWA, models.VerdictRE, models.VerdictTLE, models.VerdictAC)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query repeated failures: %w", err)
	}
	defer repeatedRows.Close()

	repeatedFailures := make([]map[string]any, 0)
	for repeatedRows.Next() {
		var problemID int64
		var externalProblemID string
		var title string
		var failedCount int
		if err := repeatedRows.Scan(&problemID, &externalProblemID, &title, &failedCount); err != nil {
			return nil, fmt.Errorf("get review summary: scan repeated failures row: %w", err)
		}
		repeatedFailures = append(repeatedFailures, map[string]any{
			"problemId":         problemID,
			"externalProblemId": externalProblemID,
			"title":             title,
			"failedCount":       failedCount,
		})
	}
	summary["repeatedFailures"] = repeatedFailures

	// 4. recentUnsolved: latest 10 unique problems from non-AC submissions
	recentRows, err := db.conn.Query(`
		SELECT
			s.problem_id,
			p.external_problem_id,
			p.title,
			MAX(s.submitted_at) AS last_submitted_at
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		WHERE s.verdict != ?
		GROUP BY s.problem_id, p.external_problem_id, p.title
		ORDER BY last_submitted_at DESC
		LIMIT 10`, models.VerdictAC)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query recent unsolved: %w", err)
	}
	defer recentRows.Close()

	recentUnsolved := make([]map[string]any, 0, 10)
	for recentRows.Next() {
		var problemID int64
		var externalProblemID string
		var title string
		var lastSubmittedAt string
		if err := recentRows.Scan(&problemID, &externalProblemID, &title, &lastSubmittedAt); err != nil {
			return nil, fmt.Errorf("get review summary: scan recent unsolved row: %w", err)
		}
		recentUnsolved = append(recentUnsolved, map[string]any{
			"problemId":         problemID,
			"externalProblemId": externalProblemID,
			"title":             title,
			"lastSubmittedAt":   lastSubmittedAt,
		})
	}
	summary["recentUnsolved"] = recentUnsolved

	problemRows, err := db.conn.Query(`
		SELECT
			p.id,
			p.external_problem_id,
			p.title,
			p.platform,
			COALESCE(p.external_contest_id, ''),
			COUNT(s.id) AS attempt_count,
			SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count,
			MAX(CASE WHEN s.verdict != ? THEN s.submitted_at END) AS last_failed_at,
			MAX(s.submitted_at) AS last_submitted_at,
			COALESCE((
				SELECT s2.verdict
				FROM submissions s2
				WHERE s2.problem_id = p.id
				ORDER BY s2.submitted_at DESC, s2.id DESC
				LIMIT 1
			), ?) AS latest_verdict,
			COALESCE(GROUP_CONCAT(DISTINCT pt.tag_name), '') AS tags_csv,
			COALESCE(prs.status, ?) AS review_status,
			prs.next_review_at,
			prs.last_updated_at
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		LEFT JOIN problem_tags pt ON pt.problem_id = p.id
		LEFT JOIN problem_review_states prs ON prs.problem_id = p.id
		GROUP BY p.id, p.external_problem_id, p.title, p.platform, p.external_contest_id
		ORDER BY last_submitted_at DESC, p.id DESC
		LIMIT 100`, models.VerdictAC, models.VerdictAC, models.VerdictUnknown, models.ReviewStatusTodo)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query problem summaries: %w", err)
	}
	defer problemRows.Close()

	problemSummaries := make([]map[string]any, 0, 100)
	reviewStatusCounts := map[string]int{
		string(models.ReviewStatusTodo):      0,
		string(models.ReviewStatusReviewing): 0,
		string(models.ReviewStatusScheduled): 0,
		string(models.ReviewStatusDone):      0,
	}
	dueReviewCount := 0
	scheduledReviewCount := 0
	now := time.Now().UTC()
	for problemRows.Next() {
		var problemID int64
		var externalProblemID string
		var title string
		var platform models.Platform
		var contestID string
		var attemptCount int
		var acCount int
		var lastFailedAt sql.NullString
		var lastSubmittedAt string
		var latestVerdict models.Verdict
		var tagsCSV string
		var reviewStatusRaw string
		var nextReviewAtRaw sql.NullString
		var lastReviewUpdatedAtRaw sql.NullString
		if err := problemRows.Scan(
			&problemID,
			&externalProblemID,
			&title,
			&platform,
			&contestID,
			&attemptCount,
			&acCount,
			&lastFailedAt,
			&lastSubmittedAt,
			&latestVerdict,
			&tagsCSV,
			&reviewStatusRaw,
			&nextReviewAtRaw,
			&lastReviewUpdatedAtRaw,
		); err != nil {
			return nil, fmt.Errorf("get review summary: scan problem summary row: %w", err)
		}

		reviewStatus := normalizeReviewStatus(models.ReviewStatus(reviewStatusRaw))
		reviewStatusCounts[string(reviewStatus)]++

		var nextReviewAt any
		reviewDue := false
		if nextReviewAtRaw.Valid && strings.TrimSpace(nextReviewAtRaw.String) != "" {
			parsed, err := parseSQLiteTimestamp(nextReviewAtRaw.String)
			if err != nil {
				return nil, fmt.Errorf("get review summary: parse problem summary next review: %w", err)
			}
			nextReviewAt = parsed
			if !parsed.After(now) {
				reviewDue = true
				dueReviewCount++
			}
			scheduledReviewCount++
		}

		var lastReviewUpdatedAt any
		if lastReviewUpdatedAtRaw.Valid && strings.TrimSpace(lastReviewUpdatedAtRaw.String) != "" {
			parsed, err := parseSQLiteTimestamp(lastReviewUpdatedAtRaw.String)
			if err != nil {
				return nil, fmt.Errorf("get review summary: parse problem summary review update: %w", err)
			}
			lastReviewUpdatedAt = parsed
		}

		problemSummaries = append(problemSummaries, map[string]any{
			"problemId":           problemID,
			"externalProblemId":   externalProblemID,
			"title":               title,
			"platform":            platform,
			"contestId":           contestID,
			"attemptCount":        attemptCount,
			"acCount":             acCount,
			"solvedLater":         acCount > 0,
			"lastFailedAt":        nullableNullString(lastFailedAt),
			"lastSubmittedAt":     lastSubmittedAt,
			"latestVerdict":       latestVerdict,
			"tags":                splitTagsCSV(tagsCSV),
			"reviewStatus":        reviewStatus,
			"nextReviewAt":        nextReviewAt,
			"lastReviewUpdatedAt": lastReviewUpdatedAt,
			"reviewDue":           reviewDue,
		})
	}
	summary["problemSummaries"] = problemSummaries
	summary["reviewStatusCounts"] = reviewStatusCounts
	summary["dueReviewCount"] = dueReviewCount
	summary["scheduledReviewCount"] = scheduledReviewCount

	contestRows, err := db.conn.Query(`
		SELECT
			COALESCE(p.external_contest_id, COALESCE(s.source_contest_id, '')) AS contest_id,
			p.platform,
			COALESCE(c.name, COALESCE(p.external_contest_id, COALESCE(s.source_contest_id, ''))) AS contest_name,
			COUNT(DISTINCT p.id) AS problem_count,
			COUNT(s.id) AS attempt_count,
			SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		LEFT JOIN contests c ON c.platform = p.platform AND c.external_contest_id = COALESCE(p.external_contest_id, s.source_contest_id)
		WHERE COALESCE(p.external_contest_id, COALESCE(s.source_contest_id, '')) != ''
		GROUP BY contest_id, p.platform, contest_name
		ORDER BY attempt_count DESC, contest_name ASC
		LIMIT 50`, models.VerdictAC)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query contest groups: %w", err)
	}
	defer contestRows.Close()

	contestGroups := make([]map[string]any, 0, 50)
	for contestRows.Next() {
		var contestID string
		var platform models.Platform
		var contestName string
		var problemCount int
		var attemptCount int
		var acCount int
		if err := contestRows.Scan(&contestID, &platform, &contestName, &problemCount, &attemptCount, &acCount); err != nil {
			return nil, fmt.Errorf("get review summary: scan contest group row: %w", err)
		}
		contestGroups = append(contestGroups, map[string]any{
			"contestId":    contestID,
			"platform":     platform,
			"contestName":  contestName,
			"problemCount": problemCount,
			"attemptCount": attemptCount,
			"acCount":      acCount,
			"solvedRate":   solveRate(problemCount, acCount),
		})
	}
	summary["contestGroups"] = contestGroups

	return summary, nil
}

func nullableNullString(value sql.NullString) any {
	if !value.Valid || strings.TrimSpace(value.String) == "" {
		return nil
	}
	return value.String
}

func solveRate(problemCount int, acCount int) float64 {
	if problemCount <= 0 {
		return 0
	}
	rate := (float64(acCount) * 100.0) / float64(problemCount)
	return math.Round(rate*10) / 10
}

func normalizeReviewStatus(status models.ReviewStatus) models.ReviewStatus {
	switch strings.ToUpper(strings.TrimSpace(string(status))) {
	case string(models.ReviewStatusReviewing):
		return models.ReviewStatusReviewing
	case string(models.ReviewStatusScheduled):
		return models.ReviewStatusScheduled
	case string(models.ReviewStatusDone):
		return models.ReviewStatusDone
	default:
		return models.ReviewStatusTodo
	}
}
