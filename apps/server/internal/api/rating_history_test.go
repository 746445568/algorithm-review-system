package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestHandleRatingHistory_EmptyAccount(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/accounts/999/rating-history", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestHandleRatingHistory_InvalidID(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/accounts/invalid/rating-history", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleRatingHistory_GetWithData(t *testing.T) {
	server := newTestServer(t)
	acc, err := server.db.UpsertAccount(models.PlatformCodeforces, "test_user")
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	entries := []models.RatingEntry{
		{AccountID: acc.ID, ContestName: "Round 1", Rating: 1200, Timestamp: "2026-01-01T00:00:00Z"},
		{AccountID: acc.ID, ContestName: "Round 2", Rating: 1300, Timestamp: "2026-02-01T00:00:00Z"},
	}
	if err := server.db.SaveRatingHistory(acc.ID, entries); err != nil {
		t.Fatalf("save rating history: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/accounts/%d/rating-history", acc.ID), nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var data []models.RatingEntry
	if err := json.NewDecoder(rec.Body).Decode(&data); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(data) != 2 {
		t.Fatalf("len = %d, want 2", len(data))
	}
	if data[0].Rating != 1200 {
		t.Fatalf("first entry rating = %d, want 1200", data[0].Rating)
	}
}
