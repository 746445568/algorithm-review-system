package storage

import (
	"testing"

	"ojreviewdesktop/internal/app"
	cryptovault "ojreviewdesktop/internal/crypto"
	"ojreviewdesktop/internal/models"
)

func openProblemPoolTestDB(t *testing.T) *DB {
	t.Helper()
	dir := t.TempDir()
	cfg := app.Config{DataDir: dir, DBPath: dir + "/test.db", MasterKeyPath: dir + "/master.key"}
	vault, err := cryptovault.LoadOrCreateVault(cfg)
	if err != nil {
		t.Fatalf("load vault: %v", err)
	}
	db, err := Open(cfg, vault)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestProblemPoolSchemaExists(t *testing.T) {
	db := openProblemPoolTestDB(t)

	for _, table := range []string{"problem_pool", "problem_pool_tags", "problem_pool_sync_tasks"} {
		var count int
		if err := db.conn.QueryRow(
			`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`,
			table,
		).Scan(&count); err != nil {
			t.Fatalf("query table %s: %v", table, err)
		}
		if count != 1 {
			t.Fatalf("table %s exists = %d, want 1", table, count)
		}
	}
}

func intPtr(v int) *int { return &v }

func TestUpsertProblemPoolItemsIsIdempotent(t *testing.T) {
	db := openProblemPoolTestDB(t)
	items := []models.ProblemPoolItem{{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1585A",
		ExternalContestID: "1585",
		ProblemIndex:      "A",
		Title:             "Life of a Flower",
		URL:               "https://codeforces.com/problemset/problem/1585/A",
		DifficultyValue:   intPtr(800),
		DifficultyScale:   "CODEFORCES_RATING",
		Source:            "CODEFORCES_PROBLEMSET",
		Tags: []models.ProblemPoolTag{
			{Name: "implementation", Source: "CODEFORCES_OFFICIAL", Confidence: 1},
		},
	}}

	result1, err := db.UpsertProblemPoolItems(items)
	if err != nil {
		t.Fatalf("upsert first: %v", err)
	}
	result2, err := db.UpsertProblemPoolItems(items)
	if err != nil {
		t.Fatalf("upsert second: %v", err)
	}
	if result1.Inserted != 1 || result2.Inserted != 0 || result2.Updated != 1 {
		t.Fatalf("unexpected results: first=%+v second=%+v", result1, result2)
	}

	var tagCount int
	if err := db.conn.QueryRow(`SELECT COUNT(*) FROM problem_pool_tags`).Scan(&tagCount); err != nil {
		t.Fatalf("count tags: %v", err)
	}
	if tagCount != 1 {
		t.Fatalf("tag count = %d, want 1", tagCount)
	}
}

func TestProblemPoolSyncTaskLifecycle(t *testing.T) {
	db := openProblemPoolTestDB(t)
	task, err := db.CreateProblemPoolSyncTask([]models.Platform{models.PlatformCodeforces, models.PlatformAtCoder})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}
	if task.Status != models.TaskPending {
		t.Fatalf("status = %s, want PENDING", task.Status)
	}
	if err := db.MarkProblemPoolSyncTaskRunning(task.ID); err != nil {
		t.Fatalf("mark running: %v", err)
	}
	if err := db.UpdateProblemPoolSyncTaskProgress(task.ID, 10, 7, 3); err != nil {
		t.Fatalf("progress: %v", err)
	}
	if err := db.MarkProblemPoolSyncTaskFinished(task.ID, models.TaskSuccess, 10, 7, 3, ""); err != nil {
		t.Fatalf("finish: %v", err)
	}
	got, err := db.GetProblemPoolSyncTask(task.ID)
	if err != nil {
		t.Fatalf("get task: %v", err)
	}
	if got.Status != models.TaskSuccess || got.FetchedCount != 10 || got.InsertedCount != 7 || got.UpdatedCount != 3 {
		t.Fatalf("task = %+v", got)
	}
}
