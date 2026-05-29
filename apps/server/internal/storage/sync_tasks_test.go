package storage

import (
	"strings"
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestCreateSyncTaskRejectsPendingTaskForSameAccount(t *testing.T) {
	db := openTestDBNoMigrate(t)
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	account, err := db.UpsertAccount(models.PlatformCodeforces, "tourist")
	if err != nil {
		t.Fatalf("upsert account: %v", err)
	}

	if _, err := db.CreateSyncTask(account.ID, ""); err != nil {
		t.Fatalf("create initial sync task: %v", err)
	}

	_, err = db.CreateSyncTask(account.ID, "")
	if err == nil {
		t.Fatal("expected pending sync task to block duplicate creation")
	}
	if !strings.Contains(err.Error(), "already queued") {
		t.Fatalf("expected already queued error, got %v", err)
	}
}

func TestCreateSyncTaskRejectsRunningTaskForSameAccount(t *testing.T) {
	db := openTestDBNoMigrate(t)
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	account, err := db.UpsertAccount(models.PlatformCodeforces, "tourist")
	if err != nil {
		t.Fatalf("upsert account: %v", err)
	}

	task, err := db.CreateSyncTask(account.ID, "")
	if err != nil {
		t.Fatalf("create initial sync task: %v", err)
	}
	if err := db.MarkSyncTaskRunning(task.ID); err != nil {
		t.Fatalf("mark sync task running: %v", err)
	}

	_, err = db.CreateSyncTask(account.ID, "")
	if err == nil {
		t.Fatal("expected running sync task to block duplicate creation")
	}
	if !strings.Contains(err.Error(), "already queued") {
		t.Fatalf("expected already queued error, got %v", err)
	}
}
