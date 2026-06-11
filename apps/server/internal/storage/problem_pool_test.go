package storage

import (
	"testing"
	"time"

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

func TestGetRecommendationPrefersWeakKnowledgePoolItem(t *testing.T) {
	db := openProblemPoolTestDB(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "100/A",
		Title:             "Solved DP",
		RawTagsJSON:       `["dp"]`,
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	knowledgeID, err := db.UpsertKnowledgeNode("dp", nil, "")
	if err != nil {
		t.Fatalf("upsert knowledge: %v", err)
	}
	if err := db.SaveProblemKnowledge(problem.ID, []int64{knowledgeID}); err != nil {
		t.Fatalf("save problem knowledge: %v", err)
	}
	if _, err := db.UpsertSubmission(models.Submission{
		Platform:             models.PlatformCodeforces,
		ExternalSubmissionID: "1",
		ProblemID:            problem.ID,
		Verdict:              models.VerdictWA,
		SubmittedAt:          time.Now().UTC(),
		RawJSON:              "{}",
	}); err != nil {
		t.Fatalf("upsert submission: %v", err)
	}
	if err := db.UpdateMasteryLevels(); err != nil {
		t.Fatalf("update mastery: %v", err)
	}
	if _, err := db.UpsertProblemPoolItems([]models.ProblemPoolItem{{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "200/A",
		Title:             "New DP",
		DifficultyValue:   intPtr(1200),
		DifficultyScale:   "CODEFORCES_RATING",
		Source:            "CODEFORCES_PROBLEMSET",
		Tags: []models.ProblemPoolTag{
			{Name: "dp", Source: "CODEFORCES_OFFICIAL", Confidence: 1},
		},
	}}); err != nil {
		t.Fatalf("upsert pool: %v", err)
	}

	recommendation, err := db.GetRecommendation("")
	if err != nil {
		t.Fatalf("get recommendation: %v", err)
	}
	if recommendation.Problem == nil {
		t.Fatal("expected recommendation")
	}
	if recommendation.Problem.ExternalProblemID != "200/A" || !recommendation.Problem.IsNew {
		t.Fatalf("recommendation = %+v", recommendation.Problem)
	}
	if recommendation.Problem.Reason != "weakest_knowledge" || recommendation.Problem.KnowledgeName != "dp" {
		t.Fatalf("reason = %s knowledge = %s", recommendation.Problem.Reason, recommendation.Problem.KnowledgeName)
	}
}

func TestGetRecommendationFallsBackToRetryFailed(t *testing.T) {
	db := openProblemPoolTestDB(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "100/B",
		Title:             "Retry Me",
		RawTagsJSON:       `["greedy"]`,
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	if _, err := db.UpsertSubmission(models.Submission{
		Platform:             models.PlatformCodeforces,
		ExternalSubmissionID: "2",
		ProblemID:            problem.ID,
		Verdict:              models.VerdictTLE,
		SubmittedAt:          time.Now().UTC(),
		RawJSON:              "{}",
	}); err != nil {
		t.Fatalf("upsert submission: %v", err)
	}

	recommendation, err := db.GetRecommendation("")
	if err != nil {
		t.Fatalf("get recommendation: %v", err)
	}
	if recommendation.Problem == nil {
		t.Fatal("expected recommendation")
	}
	if recommendation.Problem.ID != problem.ID || recommendation.Problem.IsNew {
		t.Fatalf("recommendation = %+v", recommendation.Problem)
	}
	if recommendation.Problem.Reason != "retry_failed" {
		t.Fatalf("reason = %s, want retry_failed", recommendation.Problem.Reason)
	}
}
