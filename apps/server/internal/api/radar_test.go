package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestHandleRadarData_EmptyDB(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/statistics/radar", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestHandleRadarData_WithData(t *testing.T) {
	server := newTestServer(t)
	_, err := server.db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
		RawTagsJSON:       `["dp"]`,
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	// Sync tags to knowledge graph (creates nodes + links + updates mastery)
	syncReq := httptest.NewRequest(http.MethodPost, "/api/knowledge-graph/sync", nil)
	syncRec := httptest.NewRecorder()
	server.Router().ServeHTTP(syncRec, syncReq)
	if syncRec.Code != http.StatusOK {
		t.Fatalf("sync status = %d, want %d; body=%s", syncRec.Code, http.StatusOK, syncRec.Body.String())
	}

	req := httptest.NewRequest(http.MethodGet, "/api/statistics/radar", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var data []struct {
		Name     string  `json:"name"`
		Mastery  float64 `json:"mastery"`
		Problems int     `json:"problems"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&data); err != nil {
		t.Fatalf("decode radar data: %v", err)
	}
	if len(data) == 0 {
		t.Fatalf("expected at least 1 radar item, got 0")
	}
	if data[0].Name != "dp" {
		t.Fatalf("expected name 'dp', got %q", data[0].Name)
	}
	if data[0].Problems != 1 {
		t.Fatalf("expected 1 problem, got %d", data[0].Problems)
	}
}
