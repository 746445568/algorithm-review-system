package storage

import (
	"testing"
	"time"

	"ojreviewdesktop/internal/models"
)

func TestGetVerdictStats_EmptyDB(t *testing.T) {
	db := openTestDBNoMigrate(t)
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	stats, err := db.GetVerdictStats()
	if err != nil {
		t.Fatalf("GetVerdictStats: %v", err)
	}
	if stats == nil {
		t.Fatalf("expected non-nil stats")
	}
	if len(stats) != 0 {
		t.Fatalf("len(stats) = %d, want 0", len(stats))
	}
}

func TestGetVerdictStats_GroupsByVerdict(t *testing.T) {
	db := openTestDBNoMigrate(t)
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "Test Problem A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	verdicts := []models.Verdict{
		models.VerdictAC,
		models.VerdictWA,
		models.VerdictWA,
		models.VerdictTLE,
	}
	for i, verdict := range verdicts {
		_, err := db.UpsertSubmission(models.Submission{
			Platform:             models.PlatformCodeforces,
			ExternalSubmissionID: string(rune('a' + i)),
			ProblemID:            problem.ID,
			Verdict:              verdict,
			SubmittedAt:          time.Date(2026, 6, 9, i, 0, 0, 0, time.UTC),
			RawJSON:              "{}",
		})
		if err != nil {
			t.Fatalf("upsert submission %d: %v", i, err)
		}
	}

	stats, err := db.GetVerdictStats()
	if err != nil {
		t.Fatalf("GetVerdictStats: %v", err)
	}
	counts := map[string]int{}
	for _, item := range stats {
		verdict, ok := item["verdict"].(string)
		if !ok {
			t.Fatalf("verdict entry has non-string verdict: %#v", item)
		}
		count, ok := item["count"].(int)
		if !ok {
			t.Fatalf("verdict entry has non-int count: %#v", item)
		}
		counts[verdict] = count
	}
	if counts[string(models.VerdictAC)] != 1 {
		t.Fatalf("AC count = %d, want 1", counts[string(models.VerdictAC)])
	}
	if counts[string(models.VerdictWA)] != 2 {
		t.Fatalf("WA count = %d, want 2", counts[string(models.VerdictWA)])
	}
	if counts[string(models.VerdictTLE)] != 1 {
		t.Fatalf("TLE count = %d, want 1", counts[string(models.VerdictTLE)])
	}
}

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
