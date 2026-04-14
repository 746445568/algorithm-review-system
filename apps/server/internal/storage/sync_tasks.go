package storage

import (
	"errors"

	"ojreviewdesktop/internal/models"
)

// CreateSyncTask creates a new sync task for an account
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

// GetLastSyncTask returns the most recently created sync task
func (db *DB) GetLastSyncTask() (models.SyncTask, error) {
	row := db.conn.QueryRow(`
SELECT id, platform_account_id, task_type, status, COALESCE(cursor_before,''), COALESCE(cursor_after,''), fetched_count, inserted_count, retry_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM sync_tasks WHERE id = last_insert_rowid()`)
	return scanSyncTask(row)
}

// ListSyncTasks returns the last 50 sync tasks
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

// GetSyncTask returns a sync task by ID
func (db *DB) GetSyncTask(id int64) (models.SyncTask, error) {
	row := db.conn.QueryRow(`
SELECT id, platform_account_id, task_type, status, COALESCE(cursor_before,''), COALESCE(cursor_after,''), fetched_count, inserted_count, retry_count, COALESCE(error_message,''), created_at, started_at, finished_at
FROM sync_tasks WHERE id = ?`, id)
	return scanSyncTask(row)
}

// MarkSyncTaskRunning marks a sync task as running
func (db *DB) MarkSyncTaskRunning(taskID int64) error {
	_, err := db.conn.Exec(`UPDATE sync_tasks SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?`, models.TaskRunning, taskID)
	return err
}

// UpdateSyncTaskProgress updates sync task progress
func (db *DB) UpdateSyncTaskProgress(taskID int64, fetched, inserted int, cursorAfter string) error {
	_, err := db.conn.Exec(`
UPDATE sync_tasks
SET fetched_count = ?, inserted_count = ?, cursor_after = ?
WHERE id = ?`, fetched, inserted, cursorAfter, taskID)
	return err
}

// MarkSyncTaskFinished marks a sync task as finished
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

// ListRecoverableTasks returns pending or running sync tasks
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

// ensureNoRunningSyncTask ensures no sync task is running for the account
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
