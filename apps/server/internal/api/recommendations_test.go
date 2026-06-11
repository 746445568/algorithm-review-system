package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestReviewRecommendationsEndpointReturnsProblem(t *testing.T) {
	server := newTestServer(t)
	if _, err := server.db.UpsertProblemPoolItems([]models.ProblemPoolItem{{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "200/A",
		Title:             "Stretch Task",
		DifficultyValue:   intPtrForAPITest(1200),
		DifficultyScale:   "CODEFORCES_RATING",
		Source:            "CODEFORCES_PROBLEMSET",
		Tags: []models.ProblemPoolTag{
			{Name: "implementation", Source: "CODEFORCES_OFFICIAL", Confidence: 1},
		},
	}}); err != nil {
		t.Fatalf("upsert pool: %v", err)
	}
	account, err := server.db.UpsertAccount(models.PlatformCodeforces, "tourist")
	if err != nil {
		t.Fatalf("upsert account: %v", err)
	}
	rating := 1200
	if err := server.db.UpdateAccountRating(account.ID, &rating, &rating); err != nil {
		t.Fatalf("update rating: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/review/recommendations", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var payload models.RecommendationResponse
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Problem == nil || payload.Problem.ExternalProblemID != "200/A" {
		t.Fatalf("payload = %+v", payload)
	}
}

func intPtrForAPITest(v int) *int { return &v }
