package storage

import (
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestSaveRatingHistory_ReplacesExistingForAccount(t *testing.T) {
	db := openTestDBWithMigrate(t)
	acc, err := db.UpsertAccount(models.PlatformCodeforces, "test_user")
	if err != nil {
		t.Fatalf("create account: %v", err)
	}

	entries := []models.RatingEntry{
		{AccountID: acc.ID, ContestName: "Round 900", Rating: 1200, Timestamp: "2026-05-01T00:00:00Z"},
		{AccountID: acc.ID, ContestName: "Round 910", Rating: 1250, Timestamp: "2026-05-15T00:00:00Z"},
	}
	if err := db.SaveRatingHistory(acc.ID, entries); err != nil {
		t.Fatalf("save rating history: %v", err)
	}

	newEntries := []models.RatingEntry{
		{AccountID: acc.ID, ContestName: "Round 920", Rating: 1300, Timestamp: "2026-06-01T00:00:00Z"},
	}
	if err := db.SaveRatingHistory(acc.ID, newEntries); err != nil {
		t.Fatalf("save new rating history: %v", err)
	}

	got, err := db.GetRatingHistory(acc.ID)
	if err != nil {
		t.Fatalf("get rating history: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len(rating history) = %d, want 1", len(got))
	}
	if got[0].Rating != 1300 {
		t.Fatalf("rating = %d, want 1300", got[0].Rating)
	}
}

func TestGetRatingHistory_EmptyForNewAccount(t *testing.T) {
	db := openTestDBWithMigrate(t)
	got, err := db.GetRatingHistory(999)
	if err != nil {
		t.Fatalf("get rating history: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("len(rating history) = %d, want 0", len(got))
	}
}
