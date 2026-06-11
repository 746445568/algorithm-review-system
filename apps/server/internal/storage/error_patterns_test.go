package storage

import (
	"math"
	"testing"
	"time"

	"ojreviewdesktop/internal/models"
)

func TestSaveErrorPatterns_ReplacesExistingForProblem(t *testing.T) {
	db := openTestDB(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	if err := db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{
		{PatternType: "boundary", Description: "old", Confidence: 0.5},
	}); err != nil {
		t.Fatalf("save old patterns: %v", err)
	}
	if err := db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{
		{PatternType: "overflow", Description: "new", Confidence: 0.9, SubmissionID: "s1"},
	}); err != nil {
		t.Fatalf("save new patterns: %v", err)
	}

	patterns, err := db.GetErrorPatternsByProblem(problem.ID)
	if err != nil {
		t.Fatalf("get patterns: %v", err)
	}
	if len(patterns) != 1 {
		t.Fatalf("len(patterns) = %d, want 1", len(patterns))
	}
	if patterns[0].PatternType != "overflow" {
		t.Fatalf("PatternType = %q, want overflow", patterns[0].PatternType)
	}
	if patterns[0].Description != "new" {
		t.Fatalf("Description = %q, want new", patterns[0].Description)
	}
	if patterns[0].SubmissionID != "s1" {
		t.Fatalf("SubmissionID = %q, want s1", patterns[0].SubmissionID)
	}
}

func TestSaveErrorPatterns_EmptySliceDeletesAll(t *testing.T) {
	db := openTestDB(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	if err := db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{
		{PatternType: "boundary", Confidence: 0.8},
	}); err != nil {
		t.Fatalf("save patterns: %v", err)
	}
	if err := db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{}); err != nil {
		t.Fatalf("save empty patterns: %v", err)
	}

	patterns, err := db.GetErrorPatternsByProblem(problem.ID)
	if err != nil {
		t.Fatalf("get patterns: %v", err)
	}
	if len(patterns) != 0 {
		t.Fatalf("len(patterns) = %d, want 0 after empty replace", len(patterns))
	}
}

func TestSaveErrorPatterns_SkipsEmptyPatternType(t *testing.T) {
	db := openTestDB(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	if err := db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{
		{PatternType: "", Description: "skipped", Confidence: 0.5},
		{PatternType: "boundary", Description: "kept", Confidence: 0.8},
	}); err != nil {
		t.Fatalf("save patterns: %v", err)
	}

	patterns, err := db.GetErrorPatternsByProblem(problem.ID)
	if err != nil {
		t.Fatalf("get patterns: %v", err)
	}
	if len(patterns) != 1 {
		t.Fatalf("len(patterns) = %d, want 1", len(patterns))
	}
	if patterns[0].PatternType != "boundary" {
		t.Fatalf("PatternType = %q, want boundary", patterns[0].PatternType)
	}
}

func TestSaveErrorPatterns_ClampsConfidence(t *testing.T) {
	db := openTestDB(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	if err := db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{
		{PatternType: "overflow", Confidence: 1.7},
		{PatternType: "logic", Confidence: -0.3},
	}); err != nil {
		t.Fatalf("save patterns: %v", err)
	}

	patterns, err := db.GetErrorPatternsByProblem(problem.ID)
	if err != nil {
		t.Fatalf("get patterns: %v", err)
	}
	if len(patterns) != 2 {
		t.Fatalf("len(patterns) = %d, want 2", len(patterns))
	}

	foundOverflow := false
	foundLogic := false
	for _, p := range patterns {
		switch p.PatternType {
		case "overflow":
			foundOverflow = true
			if p.Confidence != 1.0 {
				t.Fatalf("overflow Confidence = %v, want 1.0", p.Confidence)
			}
		case "logic":
			foundLogic = true
			if p.Confidence != 0 {
				t.Fatalf("logic Confidence = %v, want 0", p.Confidence)
			}
		}
	}
	if !foundOverflow || !foundLogic {
		t.Fatalf("missing expected patterns: overflow=%v logic=%v", foundOverflow, foundLogic)
	}
}

func TestSaveErrorPatterns_DoesNotAffectOtherProblems(t *testing.T) {
	db := openTestDB(t)
	problemA, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem A: %v", err)
	}
	problemB, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/B",
		Title:             "B",
	})
	if err != nil {
		t.Fatalf("upsert problem B: %v", err)
	}

	if err := db.SaveErrorPatterns(problemA.ID, []models.ErrorPattern{
		{PatternType: "boundary", Confidence: 0.8},
	}); err != nil {
		t.Fatalf("save problem A: %v", err)
	}
	if err := db.SaveErrorPatterns(problemB.ID, []models.ErrorPattern{
		{PatternType: "overflow", Confidence: 0.9},
	}); err != nil {
		t.Fatalf("save problem B: %v", err)
	}
	if err := db.SaveErrorPatterns(problemA.ID, []models.ErrorPattern{
		{PatternType: "logic", Confidence: 0.7},
	}); err != nil {
		t.Fatalf("replace problem A: %v", err)
	}

	patternsB, err := db.GetErrorPatternsByProblem(problemB.ID)
	if err != nil {
		t.Fatalf("get problem B patterns: %v", err)
	}
	if len(patternsB) != 1 || patternsB[0].PatternType != "overflow" {
		t.Fatalf("problem B should still have overflow pattern, got %v", patternsB)
	}
}

func TestDeleteAccount_CascadesErrorPatternsForOrphanProblem(t *testing.T) {
	db := openTestDB(t)
	account, err := db.UpsertAccount(models.PlatformCodeforces, "tourist")
	if err != nil {
		t.Fatalf("upsert account: %v", err)
	}
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	accountID := account.ID
	if _, err := db.UpsertSubmission(models.Submission{
		PlatformAccountID:    &accountID,
		Platform:             models.PlatformCodeforces,
		ExternalSubmissionID: "sub-1",
		ProblemID:            problem.ID,
		Verdict:              models.VerdictWA,
		SubmittedAt:          time.Date(2026, 6, 11, 10, 0, 0, 0, time.UTC),
		RawJSON:              "{}",
	}); err != nil {
		t.Fatalf("upsert submission: %v", err)
	}
	if err := db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{
		{PatternType: "boundary", Confidence: 0.8},
	}); err != nil {
		t.Fatalf("save patterns: %v", err)
	}

	if err := db.DeleteAccount(account.ID); err != nil {
		t.Fatalf("delete account: %v", err)
	}

	patterns, err := db.GetErrorPatternsByProblem(problem.ID)
	if err != nil {
		t.Fatalf("get patterns: %v", err)
	}
	if len(patterns) != 0 {
		t.Fatalf("len(patterns) = %d, want 0 after deleting orphan problem", len(patterns))
	}
}

func TestGetErrorPatternStats_AggregatesSavedPatterns(t *testing.T) {
	db := openTestDB(t)
	problemA, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem A: %v", err)
	}
	problemB, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/B",
		Title:             "B",
	})
	if err != nil {
		t.Fatalf("upsert problem B: %v", err)
	}
	if err := db.SaveErrorPatterns(problemA.ID, []models.ErrorPattern{
		{PatternType: "boundary", Confidence: 0.8},
		{PatternType: "boundary", Confidence: 0.6},
	}); err != nil {
		t.Fatalf("save problem A: %v", err)
	}
	if err := db.SaveErrorPatterns(problemB.ID, []models.ErrorPattern{
		{PatternType: "overflow", Confidence: 1.0},
	}); err != nil {
		t.Fatalf("save problem B: %v", err)
	}

	stats, err := db.GetErrorPatternStats()
	if err != nil {
		t.Fatalf("get stats: %v", err)
	}
	if len(stats) != 2 {
		t.Fatalf("len(stats) = %d, want 2", len(stats))
	}
	counts := map[string]int{}
	averages := map[string]float64{}
	for _, item := range stats {
		counts[item.PatternType] = item.Count
		averages[item.PatternType] = item.AvgConfidence
	}
	if counts["boundary"] != 2 {
		t.Fatalf("boundary count = %d, want 2", counts["boundary"])
	}
	if math.Abs(averages["boundary"]-0.7) > 1e-9 {
		t.Fatalf("boundary average = %v, want 0.7", averages["boundary"])
	}
	if counts["overflow"] != 1 {
		t.Fatalf("overflow count = %d, want 1", counts["overflow"])
	}
	if math.Abs(averages["overflow"]-1.0) > 1e-9 {
		t.Fatalf("overflow average = %v, want 1.0", averages["overflow"])
	}
}
