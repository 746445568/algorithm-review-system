package storage

import (
	"testing"

	"ojreviewdesktop/internal/app"
	cryptovault "ojreviewdesktop/internal/crypto"
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
