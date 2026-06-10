package storage

import (
	"testing"

	"ojreviewdesktop/internal/models"
	"ojreviewdesktop/internal/srs"
)

func TestSaveProblemReviewState_PersistsQualityHistory(t *testing.T) {
	db := openTestDBWithMigrate(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	state := models.ProblemReviewState{
		ProblemID:       problem.ID,
		Status:          models.ReviewStatusReviewing,
		EaseFactor:      srs.DefaultEaseFactor,
		IntervalDays:    1,
		RepetitionCount: 1,
		QualityHistory:  "[3,4,5]",
	}
	q := 5
	state.LastQuality = &q

	saved, err := db.SaveProblemReviewState(state)
	if err != nil {
		t.Fatalf("save review state: %v", err)
	}
	if saved.QualityHistory != "[3,4,5]" {
		t.Fatalf("quality_history = %q, want [3,4,5]", saved.QualityHistory)
	}

	got, err := db.GetProblemReviewState(problem.ID)
	if err != nil {
		t.Fatalf("get review state: %v", err)
	}
	if got.QualityHistory != "[3,4,5]" {
		t.Fatalf("quality_history after read = %q, want [3,4,5]", got.QualityHistory)
	}
}

func TestSaveProblemReviewState_DefaultsEmptyQualityHistory(t *testing.T) {
	db := openTestDBWithMigrate(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/B",
		Title:             "B",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	state := models.ProblemReviewState{
		ProblemID:       problem.ID,
		Status:          models.ReviewStatusReviewing,
		EaseFactor:      srs.DefaultEaseFactor,
		IntervalDays:    1,
		RepetitionCount: 0,
		QualityHistory:  "", // empty — should be normalized to "[]"
	}

	saved, err := db.SaveProblemReviewState(state)
	if err != nil {
		t.Fatalf("save review state: %v", err)
	}
	if saved.QualityHistory != "[]" {
		t.Fatalf("quality_history = %q, want []", saved.QualityHistory)
	}

	got, err := db.GetProblemReviewState(problem.ID)
	if err != nil {
		t.Fatalf("get review state: %v", err)
	}
	if got.QualityHistory != "[]" {
		t.Fatalf("quality_history after read = %q, want []", got.QualityHistory)
	}
}
