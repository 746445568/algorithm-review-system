package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleReviewCalendar_ReturnsJSON(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/review/calendar?month=2026-06", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var resp struct {
		Days          []any `json:"days"`
		CurrentStreak int   `json:"currentStreak"`
		LongestStreak int   `json:"longestStreak"`
		TodayDue      int   `json:"todayDue"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Days == nil {
		t.Fatal("days is nil, want non-nil array")
	}
	if resp.CurrentStreak != 0 {
		t.Fatalf("currentStreak = %d, want 0", resp.CurrentStreak)
	}
	if resp.LongestStreak != 0 {
		t.Fatalf("longestStreak = %d, want 0", resp.LongestStreak)
	}
	if resp.TodayDue != 0 {
		t.Fatalf("todayDue = %d, want 0", resp.TodayDue)
	}
}

func TestHandleReviewCalendar_RejectsInvalidMonth(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/review/calendar?month=invalid", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandleReviewCalendar_DefaultsToCurrentMonth(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/review/calendar", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}
