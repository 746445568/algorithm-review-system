package storage

import (
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestGetVerdictStats_EmptyDB(t *testing.T) {
	db := openTestDBWithMigrate(t)

	stats, err := db.GetVerdictStats()
	if err != nil {
		t.Fatalf("GetVerdictStats: %v", err)
	}
	if len(stats) != 0 {
		t.Fatalf("expected empty stats, got %d entries", len(stats))
	}
}

func TestGetVerdictStats_GroupsByVerdict(t *testing.T) {
	db := openTestDBWithMigrate(t)

	// Set up: account + problem + submissions
	_, err := db.UpsertAccount(models.PlatformCodeforces, "test_user")
	if err != nil {
		t.Fatalf("upsert account: %v", err)
	}

	_, err = db.conn.Exec(`INSERT INTO problems (platform, external_problem_id, title, raw_tags_json) VALUES ('CODEFORCES', '1000/A', 'Test Problem A', '[]')`)
	if err != nil {
		t.Fatalf("insert problem: %v", err)
	}

	// 5 submissions: 2 ACCEPTED, 2 WRONG_ANSWER, 1 TIME_LIMIT_EXCEEDED
	verdicts := []string{"ACCEPTED", "WRONG_ANSWER", "ACCEPTED", "TIME_LIMIT_EXCEEDED", "WRONG_ANSWER"}
	for i, v := range verdicts {
		_, err = db.conn.Exec(
			`INSERT INTO submissions (platform, external_submission_id, platform_account_id, problem_id, verdict, language, submitted_at, raw_json) VALUES ('CODEFORCES', ?, 1, 1, ?, 'C++', '2026-06-09T00:00:00Z', '{}')`,
			i+1, v,
		)
		if err != nil {
			t.Fatalf("insert submission %d: %v", i, err)
		}
	}

	stats, err := db.GetVerdictStats()
	if err != nil {
		t.Fatalf("GetVerdictStats: %v", err)
	}
	if len(stats) != 3 {
		t.Fatalf("expected 3 verdict groups, got %d", len(stats))
	}

	// Each entry should have "verdict" and "count"
	countMap := map[string]int{}
	for _, entry := range stats {
		v, _ := entry["verdict"].(string)
		c, _ := entry["count"].(int)
		countMap[v] = c
	}

	if countMap["ACCEPTED"] != 2 {
		t.Fatalf("expected ACCEPTED count 2, got %d", countMap["ACCEPTED"])
	}
	if countMap["WRONG_ANSWER"] != 2 {
		t.Fatalf("expected WRONG_ANSWER count 2, got %d", countMap["WRONG_ANSWER"])
	}
	if countMap["TIME_LIMIT_EXCEEDED"] != 1 {
		t.Fatalf("expected TIME_LIMIT_EXCEEDED count 1, got %d", countMap["TIME_LIMIT_EXCEEDED"])
	}
}

func TestBackupRestore_PreservesData(t *testing.T) {
	db := openTestDBWithMigrate(t)

	// Save some identifiable data
	err := db.SaveAISettings(models.AISettings{
		Provider: "openai",
		Model:    "gpt-4o",
		APIKey:   "sk-test-backup-key",
	})
	if err != nil {
		t.Fatalf("save AI settings: %v", err)
	}

	// Backup
	backupPath := db.cfg.DBPath + ".bak"
	if err := db.Backup(backupPath); err != nil {
		t.Fatalf("Backup: %v", err)
	}

	// Modify data
	err = db.SaveAISettings(models.AISettings{
		Provider: "deepseek",
		Model:    "deepseek-chat",
		APIKey:   "sk-modified",
	})
	if err != nil {
		t.Fatalf("save modified AI settings: %v", err)
	}

	// Verify modification took effect
	settings, err := db.LoadAISettings()
	if err != nil {
		t.Fatalf("load AI settings: %v", err)
	}
	if settings.Provider != "deepseek" {
		t.Fatalf("expected deepseek after modification, got %s", settings.Provider)
	}

	// Restore
	if err := db.Restore(backupPath); err != nil {
		t.Fatalf("Restore: %v", err)
	}

	// Verify original data is back
	settings, err = db.LoadAISettings()
	if err != nil {
		t.Fatalf("load AI settings after restore: %v", err)
	}
	if settings.Provider != "openai" {
		t.Fatalf("expected openai after restore, got %s", settings.Provider)
	}
	if settings.APIKey != "sk-test-backup-key" {
		t.Fatalf("expected original APIKey after restore, got %s", settings.APIKey)
	}
}

func openTestDBWithMigrate(t *testing.T) *DB {
	t.Helper()
	db := openTestDBNoMigrate(t)
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}
