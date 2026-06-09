package storage

import (
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestBackupRestore_PreservesData(t *testing.T) {
	db := openTestDBNoMigrate(t)
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	original := models.AISettings{
		Provider: "openai",
		Model:    "gpt-4o",
		APIKey:   "sk-test-backup-key",
	}
	if err := db.SaveAISettings(original); err != nil {
		t.Fatalf("save original AI settings: %v", err)
	}

	backupPath := db.cfg.DBPath + ".bak"
	if err := db.Backup(backupPath); err != nil {
		t.Fatalf("Backup: %v", err)
	}

	modified := models.AISettings{
		Provider: "deepseek",
		Model:    "deepseek-chat",
		APIKey:   "sk-modified",
	}
	if err := db.SaveAISettings(modified); err != nil {
		t.Fatalf("save modified AI settings: %v", err)
	}
	settings, err := db.LoadAISettings()
	if err != nil {
		t.Fatalf("load modified AI settings: %v", err)
	}
	if settings.Provider != modified.Provider {
		t.Fatalf("Provider after modification = %q, want %q", settings.Provider, modified.Provider)
	}

	if err := db.Restore(backupPath); err != nil {
		t.Fatalf("Restore: %v", err)
	}

	settings, err = db.LoadAISettings()
	if err != nil {
		t.Fatalf("load restored AI settings: %v", err)
	}
	if settings.Provider != original.Provider {
		t.Fatalf("Provider after restore = %q, want %q", settings.Provider, original.Provider)
	}
	if settings.Model != original.Model {
		t.Fatalf("Model after restore = %q, want %q", settings.Model, original.Model)
	}
	if settings.APIKey != original.APIKey {
		t.Fatalf("APIKey after restore = %q, want %q", settings.APIKey, original.APIKey)
	}
}
