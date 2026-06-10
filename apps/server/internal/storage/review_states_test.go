package storage

import (
	"testing"
	"time"

	"ojreviewdesktop/internal/models"
	"ojreviewdesktop/internal/srs"
)

func TestGetReviewCalendar_ReturnsDueAndCompletedCounts(t *testing.T) {
	db := openTestDBWithMigrate(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	now := time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC)
	result := srs.Calculate(srs.ReviewInput{
		Quality:         srs.QualityEasy,
		EaseFactor:      srs.DefaultEaseFactor,
		IntervalDays:    srs.InitialInterval,
		RepetitionCount: 0,
	}, now)

	nextReview := result.NextReviewAt
	state := models.ProblemReviewState{
		ProblemID:       problem.ID,
		Status:          models.ReviewStatusScheduled,
		EaseFactor:      result.EaseFactor,
		IntervalDays:    result.IntervalDays,
		RepetitionCount: result.RepetitionCount,
		NextReviewAt:    &nextReview,
	}
	q := srs.QualityEasy
	state.LastQuality = &q
	if _, err := db.SaveProblemReviewState(state); err != nil {
		t.Fatalf("save review state: %v", err)
	}

	days, err := db.GetReviewCalendar(now.Year(), int(now.Month()))
	if err != nil {
		t.Fatalf("get review calendar: %v", err)
	}
	if len(days) == 0 {
		t.Fatalf("expected at least 1 day in calendar, got 0")
	}

	nextDate := nextReview.Format("2006-01-02")
	found := false
	for _, d := range days {
		if d.Date == nextDate {
			found = true
			if d.Due < 1 {
				t.Fatalf("date %s: due = %d, want >= 1", d.Date, d.Due)
			}
		}
	}
	if !found {
		t.Fatalf("date %s not found in calendar results", nextDate)
	}
}

func TestGetReviewStreak_NoReviews(t *testing.T) {
	db := openTestDBWithMigrate(t)
	current, longest, err := db.GetReviewStreak()
	if err != nil {
		t.Fatalf("get review streak: %v", err)
	}
	if current != 0 {
		t.Fatalf("current streak = %d, want 0", current)
	}
	if longest != 0 {
		t.Fatalf("longest streak = %d, want 0", longest)
	}
}

func TestGetReviewCalendar_EmptyDB(t *testing.T) {
	db := openTestDBWithMigrate(t)
	days, err := db.GetReviewCalendar(2026, 6)
	if err != nil {
		t.Fatalf("get review calendar: %v", err)
	}
	if days == nil {
		t.Fatal("days is nil, want non-nil empty slice")
	}
	if len(days) != 0 {
		t.Fatalf("len(days) = %d, want 0", len(days))
	}
}

func TestGetReviewStreak_WithReviews(t *testing.T) {
	db := openTestDBWithMigrate(t)
	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1001/B",
		Title:             "B",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	now := time.Now().UTC().Truncate(24 * time.Hour)
	nextReview := now.AddDate(0, 0, 3)
	state := models.ProblemReviewState{
		ProblemID:       problem.ID,
		Status:          models.ReviewStatusScheduled,
		EaseFactor:      srs.DefaultEaseFactor,
		IntervalDays:    srs.InitialInterval,
		RepetitionCount: 1,
		NextReviewAt:    &nextReview,
	}
	q := srs.QualityEasy
	state.LastQuality = &q
	if _, err := db.SaveProblemReviewState(state); err != nil {
		t.Fatalf("save review state: %v", err)
	}

	current, _, err := db.GetReviewStreak()
	if err != nil {
		t.Fatalf("get review streak: %v", err)
	}
	if current < 1 {
		t.Fatalf("current streak = %d, want >= 1", current)
	}
}
