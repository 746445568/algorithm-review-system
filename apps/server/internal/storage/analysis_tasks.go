package storage

import (
	"database/sql"
	"errors"

	"ojreviewdesktop/internal/models"
)

// CreateAnalysisTask creates a new analysis task or returns existing one
func (db *DB) CreateAnalysisTask(provider, model string, snapshotID int64) (models.AnalysisTask, bool, error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

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

// CreateAnalysisTaskWithTypedSnapshot creates an analysis task with a typed snapshot
func (db *DB) CreateAnalysisTaskWithTypedSnapshot(provider, model, summaryJSON, snapshotType string, problemID *int64) (models.AnalysisTask, bool, error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	tx, err := db.conn.Begin()
	if err != nil {
		return models.AnalysisTask{}, false, err
	}
	defer tx.Rollback()

	if problemID != nil {
		_, err = tx.Exec(
			`INSERT INTO review_snapshots(summary_json, snapshot_type, problem_id) VALUES (?, ?, ?)`,
			summaryJSON, snapshotType, *problemID,
		)
	} else {
		_, err = tx.Exec(
			`INSERT INTO review_snapshots(summary_json, snapshot_type) VALUES (?, ?)`,
			summaryJSON, snapshotType,
		)
	}
	if err != nil {
		return models.AnalysisTask{}, false, err
	}

	var snapshotID int64
	if err := tx.QueryRow(`SELECT last_insert_rowid()`).Scan(&snapshotID); err != nil {
		return models.AnalysisTask{}, false, err
	}

	_, err = tx.Exec(`
INSERT INTO analysis_tasks(status, provider, model, input_snapshot_id)
VALUES (?, ?, ?, ?)`, models.TaskPending, provider, model, snapshotID)
	if err != nil {
		return models.AnalysisTask{}, false, err
	}

	task, err := scanAnalysisTask(tx.QueryRow(`
SELECT id, status, provider, model, input_snapshot_id, COALESCE(result_text,''), COALESCE(result_json,''), COALESCE(error_message,''), retry_count, created_at, updated_at
FROM analysis_tasks WHERE id = last_insert_rowid()`))
	if err != nil {
		return models.AnalysisTask{}, false, err
	}

	if err := tx.Commit(); err != nil {
		return models.AnalysisTask{}, false, err
	}

	return task, false, nil
}

// GetLastAnalysisTask returns the most recently created analysis task
func (db *DB) GetLastAnalysisTask() (models.AnalysisTask, error) {
	row := db.conn.QueryRow(`
SELECT id, status, provider, model, input_snapshot_id, COALESCE(result_text,''), COALESCE(result_json,''), COALESCE(error_message,''), retry_count, created_at, updated_at
FROM analysis_tasks WHERE id = last_insert_rowid()`)
	return scanAnalysisTask(row)
}

// GetAnalysisTask returns an analysis task by ID
func (db *DB) GetAnalysisTask(id int64) (models.AnalysisTask, error) {
	row := db.conn.QueryRow(`
SELECT id, status, provider, model, input_snapshot_id, COALESCE(result_text,''), COALESCE(result_json,''), COALESCE(error_message,''), retry_count, created_at, updated_at
FROM analysis_tasks WHERE id = ?`, id)
	return scanAnalysisTask(row)
}

// GetLatestGlobalAnalysisTask returns the most recent successful global analysis
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

// GetLatestProblemAnalysisTask returns the most recent successful analysis task for a problem
func (db *DB) GetLatestProblemAnalysisTask(problemID int64) (models.AnalysisTask, error) {
	row := db.conn.QueryRow(`
SELECT at.id, at.status, at.provider, at.model, at.input_snapshot_id,
       COALESCE(at.result_text,''), COALESCE(at.result_json,''), COALESCE(at.error_message,''),
       at.retry_count, at.created_at, at.updated_at
FROM analysis_tasks at
JOIN review_snapshots rs ON rs.id = at.input_snapshot_id
WHERE rs.problem_id = ? AND at.status = ?
ORDER BY at.created_at DESC LIMIT 1`, problemID, models.TaskSuccess)
	return scanAnalysisTask(row)
}

// ListProblemAnalysisTasks returns all analysis tasks for a problem
func (db *DB) ListProblemAnalysisTasks(problemID int64) ([]models.AnalysisTask, error) {
	rows, err := db.conn.Query(`
SELECT at.id, at.status, at.provider, at.model, at.input_snapshot_id,
       COALESCE(at.result_text,''), COALESCE(at.result_json,''), COALESCE(at.error_message,''),
       at.retry_count, at.created_at, at.updated_at
FROM analysis_tasks at
JOIN review_snapshots rs ON rs.id = at.input_snapshot_id
WHERE rs.problem_id = ?
ORDER BY at.created_at DESC`, problemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := make([]models.AnalysisTask, 0)
	for rows.Next() {
		task, err := scanAnalysisTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

// MarkAnalysisTaskRunning marks an analysis task as running
func (db *DB) MarkAnalysisTaskRunning(taskID int64) error {
	_, err := db.conn.Exec(`UPDATE analysis_tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, models.TaskRunning, taskID)
	return err
}

// MarkAnalysisTaskFinished marks an analysis task as finished
func (db *DB) MarkAnalysisTaskFinished(taskID int64, status models.TaskStatus, resultText, resultJSON, message string) error {
	_, err := db.conn.Exec(`
UPDATE analysis_tasks
SET status = ?, result_text = ?, result_json = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?`, status, resultText, resultJSON, message, taskID)
	return err
}

// ListRecoverableAnalysisTasks returns pending or running analysis tasks
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

// findReusableAnalysisTask finds a reusable analysis task
func (db *DB) findReusableAnalysisTask(snapshotID int64, provider, model string) (models.AnalysisTask, error) {
	row := db.conn.QueryRow(`
SELECT id, status, provider, model, input_snapshot_id, COALESCE(result_text,''), COALESCE(result_json,''), COALESCE(error_message,''), retry_count, created_at, updated_at
FROM analysis_tasks
WHERE input_snapshot_id = ? AND provider = ? AND model = ?
	AND status IN ('PENDING', 'RUNNING', 'SUCCESS')
	AND created_at >= datetime('now', '-10 minutes')
ORDER BY created_at DESC LIMIT 1`, snapshotID, provider, model)
	return scanAnalysisTask(row)
}
