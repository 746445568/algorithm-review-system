package storage

import (
	"testing"

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
	counts := map[string]int{}
	averages := map[string]float64{}
	for _, item := range stats {
		counts[item.PatternType] = item.Count
		averages[item.PatternType] = item.AvgConfidence
	}
	if counts["boundary"] != 2 {
		t.Fatalf("boundary count = %d, want 2", counts["boundary"])
	}
	if averages["boundary"] != 0.7 {
		t.Fatalf("boundary average = %v, want 0.7", averages["boundary"])
	}
	if counts["overflow"] != 1 {
		t.Fatalf("overflow count = %d, want 1", counts["overflow"])
	}
}
