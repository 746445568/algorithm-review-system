package storage

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"ojreviewdesktop/internal/app"
	cryptovault "ojreviewdesktop/internal/crypto"
)

func openTestDBNoMigrate(t *testing.T) *DB {
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

	return db
}

func TestAddColumnIfMissingRejectsInvalidTableNames(t *testing.T) {
	db := openTestDBNoMigrate(t)

	// Test malicious table names that attempt SQL injection
	maliciousTables := []string{
		"users; DROP TABLE owner_profile; --",
		"owner_profile; DELETE FROM problems; --",
		"test' OR '1'='1",
		"test\" OR \"1\"=\"1",
		"table_name; UPDATE platform_accounts SET rating=9999; --",
		"", // Empty table name
		"nonexistent_table",
	}

	for _, table := range maliciousTables {
		err := db.addColumnIfMissing(table, "test_col", "TEXT")
		if err == nil {
			t.Errorf("Expected error for malicious table name %q, got nil", table)
		}
	}
}

func TestAddColumnIfMissingAcceptsValidTableNames(t *testing.T) {
	db := openTestDBNoMigrate(t)

	// Create test table using an allowed table name pattern
	_, err := db.conn.Exec("CREATE TABLE problems (id INTEGER PRIMARY KEY, title TEXT)")
	if err != nil {
		t.Fatalf("Create table failed: %v", err)
	}

	// Should successfully add column to allowed table
	err = db.addColumnIfMissing("problems", "new_col", "TEXT")
	if err != nil {
		t.Fatalf("Expected success for valid table, got error: %v", err)
	}

	// Verify column was added
	var colCount int
	err = db.conn.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('problems') WHERE name = 'new_col'`).Scan(&colCount)
	if err != nil {
		t.Fatalf("Query pragma failed: %v", err)
	}
	if colCount != 1 {
		t.Errorf("Expected column to be added, got count %d", colCount)
	}

	// Calling again should be idempotent (no error)
	err = db.addColumnIfMissing("problems", "new_col", "TEXT")
	if err != nil {
		t.Fatalf("Expected idempotent success, got error: %v", err)
	}
}

func TestAddColumnIfMissingWithAllAllowedTables(t *testing.T) {
	db := openTestDBNoMigrate(t)

	// Run migration to create all tables
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("MigrateWithBackup failed: %v", err)
	}

	// Test that all allowed tables work correctly
	for table := range allowedTables {
		// Try to add a test column (will fail for some tables if they already have it, which is OK)
		err := db.addColumnIfMissing(table, "test_column_for_validation", "TEXT")
		// We expect either success (column added) or "duplicate column" error (column exists)
		// Both are acceptable - the key is that the table name is accepted
		if err != nil {
			// Check if it's a duplicate column error (acceptable)
			if !strings.Contains(err.Error(), "duplicate column") {
				t.Errorf("Unexpected error for table %s: %v", table, err)
			}
		}
	}
}
