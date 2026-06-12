package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

const errProblemPoolSyncTaskAlreadyQueued = "problem pool sync task already queued"

type ProblemPoolUpsertResult struct {
	Fetched  int
	Inserted int
	Updated  int
}

func (db *DB) UpsertProblemPoolItems(items []models.ProblemPoolItem) (ProblemPoolUpsertResult, error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	result := ProblemPoolUpsertResult{Fetched: len(items)}
	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := db.conn.Begin()
	if err != nil {
		return result, fmt.Errorf("upsert problem pool: begin: %w", err)
	}
	defer tx.Rollback()

	for _, item := range items {
		if item.Platform == "" || strings.TrimSpace(item.ExternalProblemID) == "" || strings.TrimSpace(item.Title) == "" {
			continue
		}

		var existingID int64
		err := tx.QueryRow(`
SELECT id FROM problem_pool WHERE platform = ? AND external_problem_id = ?`,
			item.Platform, item.ExternalProblemID,
		).Scan(&existingID)
		inserted := err == sql.ErrNoRows
		if err != nil && err != sql.ErrNoRows {
			return result, fmt.Errorf("upsert problem pool: lookup %s %s: %w", item.Platform, item.ExternalProblemID, err)
		}

		_, err = tx.Exec(`
INSERT INTO problem_pool(platform, external_problem_id, external_contest_id, problem_index, title, url, difficulty_value, difficulty_raw_value, difficulty_scale, source, solver_count, is_experimental, fetched_at, last_seen_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(platform, external_problem_id) DO UPDATE SET
  external_contest_id = excluded.external_contest_id,
  problem_index = excluded.problem_index,
  title = excluded.title,
  url = excluded.url,
  difficulty_value = excluded.difficulty_value,
  difficulty_raw_value = excluded.difficulty_raw_value,
  difficulty_scale = excluded.difficulty_scale,
  source = excluded.source,
  solver_count = excluded.solver_count,
  is_experimental = excluded.is_experimental,
  last_seen_at = excluded.last_seen_at,
  updated_at = excluded.updated_at`,
			item.Platform,
			item.ExternalProblemID,
			nullableString(item.ExternalContestID),
			item.ProblemIndex,
			item.Title,
			nullableString(item.URL),
			nullableInt(item.DifficultyValue),
			nullableInt(item.DifficultyRaw),
			item.DifficultyScale,
			item.Source,
			nullableInt(item.SolverCount),
			boolToInt(item.IsExperimental),
			now,
			now,
			now,
		)
		if err != nil {
			return result, fmt.Errorf("upsert problem pool: save %s %s: %w", item.Platform, item.ExternalProblemID, err)
		}

		var poolID int64
		if err := tx.QueryRow(`
SELECT id FROM problem_pool WHERE platform = ? AND external_problem_id = ?`,
			item.Platform, item.ExternalProblemID,
		).Scan(&poolID); err != nil {
			return result, fmt.Errorf("upsert problem pool: fetch saved id: %w", err)
		}

		if _, err := tx.Exec(`DELETE FROM problem_pool_tags WHERE problem_pool_id = ?`, poolID); err != nil {
			return result, fmt.Errorf("upsert problem pool: clear tags: %w", err)
		}
		for _, tag := range item.Tags {
			name := strings.TrimSpace(tag.Name)
			source := strings.TrimSpace(tag.Source)
			if name == "" || source == "" {
				continue
			}
			confidence := tag.Confidence
			if confidence < 0 {
				confidence = 0
			}
			if confidence > 1 {
				confidence = 1
			}
			if _, err := tx.Exec(`
INSERT OR IGNORE INTO problem_pool_tags(problem_pool_id, tag_name, tag_source, confidence)
VALUES (?, ?, ?, ?)`, poolID, name, source, confidence); err != nil {
				return result, fmt.Errorf("upsert problem pool: insert tag %q: %w", name, err)
			}
		}

		if inserted {
			result.Inserted++
		} else {
			_ = existingID
			result.Updated++
		}
	}

	if err := tx.Commit(); err != nil {
		return result, fmt.Errorf("upsert problem pool: commit: %w", err)
	}
	return result, nil
}

func (db *DB) CreateProblemPoolSyncTask(platforms []models.Platform) (models.ProblemPoolSyncTask, error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	if err := db.ensureNoActiveProblemPoolSyncTask(); err != nil {
		return models.ProblemPoolSyncTask{}, err
	}
	raw, err := json.Marshal(platforms)
	if err != nil {
		return models.ProblemPoolSyncTask{}, fmt.Errorf("marshal platforms: %w", err)
	}
	_, err = db.conn.Exec(`
INSERT INTO problem_pool_sync_tasks(status, platforms_json)
VALUES (?, ?)`, models.TaskPending, string(raw))
	if err != nil {
		return models.ProblemPoolSyncTask{}, err
	}
	return db.GetLastProblemPoolSyncTask()
}

func (db *DB) GetLastProblemPoolSyncTask() (models.ProblemPoolSyncTask, error) {
	return scanProblemPoolSyncTask(db.conn.QueryRow(`
SELECT id, status, platforms_json, fetched_count, inserted_count, updated_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM problem_pool_sync_tasks WHERE id = last_insert_rowid()`))
}

func (db *DB) GetProblemPoolSyncTask(id int64) (models.ProblemPoolSyncTask, error) {
	return scanProblemPoolSyncTask(db.conn.QueryRow(`
SELECT id, status, platforms_json, fetched_count, inserted_count, updated_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM problem_pool_sync_tasks WHERE id = ?`, id))
}

func (db *DB) ListProblemPoolSyncTasks() ([]models.ProblemPoolSyncTask, error) {
	rows, err := db.conn.Query(`
SELECT id, status, platforms_json, fetched_count, inserted_count, updated_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM problem_pool_sync_tasks ORDER BY created_at DESC LIMIT 20`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := make([]models.ProblemPoolSyncTask, 0)
	for rows.Next() {
		task, err := scanProblemPoolSyncTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (db *DB) ListRecoverableProblemPoolSyncTasks() ([]models.ProblemPoolSyncTask, error) {
	rows, err := db.conn.Query(`
SELECT id, status, platforms_json, fetched_count, inserted_count, updated_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM problem_pool_sync_tasks
WHERE status IN (?, ?)
ORDER BY created_at ASC`, models.TaskPending, models.TaskRunning)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := make([]models.ProblemPoolSyncTask, 0)
	for rows.Next() {
		task, err := scanProblemPoolSyncTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (db *DB) MarkProblemPoolSyncTaskRunning(taskID int64) error {
	_, err := db.conn.Exec(`UPDATE problem_pool_sync_tasks SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?`, models.TaskRunning, taskID)
	return err
}

func (db *DB) UpdateProblemPoolSyncTaskProgress(taskID int64, fetched, inserted, updated int) error {
	_, err := db.conn.Exec(`
UPDATE problem_pool_sync_tasks
SET fetched_count = ?, inserted_count = ?, updated_count = ?
WHERE id = ?`, fetched, inserted, updated, taskID)
	return err
}

func (db *DB) MarkProblemPoolSyncTaskFinished(taskID int64, status models.TaskStatus, fetched, inserted, updated int, message string) error {
	_, err := db.conn.Exec(`
UPDATE problem_pool_sync_tasks
SET status = ?, fetched_count = ?, inserted_count = ?, updated_count = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP
WHERE id = ?`, status, fetched, inserted, updated, message, taskID)
	return err
}

func (db *DB) ensureNoActiveProblemPoolSyncTask() error {
	var count int
	if err := db.conn.QueryRow(`
SELECT COUNT(1)
FROM problem_pool_sync_tasks
WHERE status IN (?, ?)`, models.TaskPending, models.TaskRunning).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf(errProblemPoolSyncTaskAlreadyQueued)
	}
	return nil
}

type problemPoolSyncTaskScanner interface {
	Scan(dest ...any) error
}

func scanProblemPoolSyncTask(scanner problemPoolSyncTaskScanner) (models.ProblemPoolSyncTask, error) {
	var task models.ProblemPoolSyncTask
	var startedAt sql.NullString
	var finishedAt sql.NullString
	var createdAtRaw string
	if err := scanner.Scan(
		&task.ID,
		&task.Status,
		&task.PlatformsJSON,
		&task.FetchedCount,
		&task.InsertedCount,
		&task.UpdatedCount,
		&task.ErrorMessage,
		&createdAtRaw,
		&startedAt,
		&finishedAt,
	); err != nil {
		return task, err
	}
	createdAt, err := parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return task, fmt.Errorf("parse problem pool sync task created_at: %w", err)
	}
	task.CreatedAt = createdAt
	if startedAt.Valid {
		parsed, err := parseSQLiteTimestamp(startedAt.String)
		if err != nil {
			return task, fmt.Errorf("parse problem pool sync task started_at: %w", err)
		}
		task.StartedAt = &parsed
	}
	if finishedAt.Valid {
		parsed, err := parseSQLiteTimestamp(finishedAt.String)
		if err != nil {
			return task, fmt.Errorf("parse problem pool sync task finished_at: %w", err)
		}
		task.FinishedAt = &parsed
	}
	return task, nil
}

func nullableInt(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
