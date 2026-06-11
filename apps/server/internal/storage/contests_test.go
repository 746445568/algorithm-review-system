package storage

import (
	"testing"
	"time"

	"ojreviewdesktop/internal/models"
)

func TestGetContestsFiltersUpcomingByCurrentTime(t *testing.T) {
	db := openTestDB(t)
	now := time.Now().UTC()

	past, err := db.UpsertContest(models.Contest{
		Platform:          models.PlatformCodeforces,
		ExternalContestID: "past",
		Name:              "Past contest stored as upcoming",
		StartTime:         now.AddDate(0, 0, -14),
		DurationMinutes:   120,
		URL:               "https://example.com/past",
		Status:            "UPCOMING",
	})
	if err != nil {
		t.Fatalf("upsert past contest: %v", err)
	}
	future, err := db.UpsertContest(models.Contest{
		Platform:          models.PlatformCodeforces,
		ExternalContestID: "future",
		Name:              "Future contest",
		StartTime:         now.AddDate(0, 0, 14),
		DurationMinutes:   120,
		URL:               "https://example.com/future",
		Status:            "UPCOMING",
	})
	if err != nil {
		t.Fatalf("upsert future contest: %v", err)
	}

	upcoming, err := db.GetContests(ContestQueryOptions{Status: "UPCOMING"})
	if err != nil {
		t.Fatalf("GetContests upcoming: %v", err)
	}
	if len(upcoming) != 1 {
		t.Fatalf("len(upcoming) = %d, want 1; items=%#v", len(upcoming), upcoming)
	}
	if upcoming[0].ID != future.ID {
		t.Fatalf("upcoming[0].ID = %d, want future ID %d", upcoming[0].ID, future.ID)
	}

	all, err := db.GetContests(ContestQueryOptions{})
	if err != nil {
		t.Fatalf("GetContests all: %v", err)
	}
	statuses := map[int64]string{}
	for _, contest := range all {
		statuses[contest.ID] = contest.Status
	}
	if statuses[past.ID] != "FINISHED" {
		t.Fatalf("past status = %q, want FINISHED", statuses[past.ID])
	}
	if statuses[future.ID] != "UPCOMING" {
		t.Fatalf("future status = %q, want UPCOMING", statuses[future.ID])
	}
}
