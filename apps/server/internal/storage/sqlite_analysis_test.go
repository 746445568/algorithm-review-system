package storage

import (
	"os"
	"path/filepath"
	"testing"

	"ojreviewdesktop/internal/app"
	cryptovault "ojreviewdesktop/internal/crypto"
	"ojreviewdesktop/internal/models"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()

	baseDir := t.TempDir()
	cfg := app.Config{
		AppDir:        baseDir,
		DataDir:       filepath.Join(baseDir, "data"),
		LogDir:        filepath.Join(baseDir, "logs"),
		CacheDir:      filepath.Join(baseDir, "cache"),
		ExportDir:     filepath.Join(baseDir, "exports"),
		SecureDir:     filepath.Join(baseDir, "secure"),
		DBPath:        filepath.Join(baseDir, "data", "ojreview.db"),
		ListenAddr:    "127.0.0.1:0",
		MasterKeyPath: filepath.Join(baseDir, "secure", "master.key"),
	}

	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}
	if err := os.MkdirAll(cfg.LogDir, 0o755); err != nil {
		t.Fatalf("mkdir log dir: %v", err)
	}
	if err := os.MkdirAll(cfg.CacheDir, 0o755); err != nil {
		t.Fatalf("mkdir cache dir: %v", err)
	}
	if err := os.MkdirAll(cfg.ExportDir, 0o755); err != nil {
		t.Fatalf("mkdir export dir: %v", err)
	}
	if err := os.MkdirAll(cfg.SecureDir, 0o755); err != nil {
		t.Fatalf("mkdir secure dir: %v", err)
	}

	vault, err := cryptovault.LoadOrCreateVault(cfg)
	if err != nil {
		t.Fatalf("load vault: %v", err)
	}

	db, err := Open(cfg, vault)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	return db
}

func TestCreateAnalysisTaskWithTypedSnapshot(t *testing.T) {
	db := openTestDB(t)

	task, reused, err := db.CreateAnalysisTaskWithTypedSnapshot(
		"deepseek",
		"deepseek-reasoner",
		`{"summary":"ok"}`,
		"problem",
		nil,
	)
	if err != nil {
		t.Fatalf("create analysis task with snapshot: %v", err)
	}
	if reused {
		t.Fatalf("expected fresh task creation")
	}
	if task.Status != models.TaskPending {
		t.Fatalf("expected pending task, got %s", task.Status)
	}
	if task.InputSnapshotID <= 0 {
		t.Fatalf("expected snapshot id, got %d", task.InputSnapshotID)
	}
}

func TestFindReusableAnalysisTask_SkipsFailedTask(t *testing.T) {
	db := openTestDB(t)

	task, _, err := db.CreateAnalysisTaskWithTypedSnapshot("openai", "gpt-4o", "{\"summary\":\"test\"}", "problem", nil)
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	err = db.MarkAnalysisTaskFinished(task.ID, models.TaskFailed, "", "", "intentional failure")
	if err != nil {
		t.Fatalf("mark failed: %v", err)
	}

	_, err = db.findReusableAnalysisTask(task.InputSnapshotID, "openai", "gpt-4o")
	if err == nil {
		t.Error("expected no reusable task for FAILED status, but got one")
	}
}
