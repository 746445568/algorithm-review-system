package judges

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ojreviewdesktop/internal/models"
)

func TestCodeforcesFetchProblemCatalogNormalizesItems(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/problemset.problems" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(codeforcesAPIEnvelope{
			Status: "OK",
			Result: json.RawMessage(`{"problems":[{"contestId":1585,"index":"A","name":"Life of a Flower","rating":800,"tags":["implementation"]}]}`),
		})
	}))
	defer server.Close()

	adapter := &CodeforcesAdapter{
		client:  server.Client(),
		baseURL: server.URL,
		now:     func() time.Time { return time.Unix(0, 0) },
	}
	items, err := adapter.FetchProblemCatalog(context.Background())
	if err != nil {
		t.Fatalf("fetch catalog: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1", len(items))
	}
	item := items[0]
	if item.Platform != models.PlatformCodeforces || item.ExternalProblemID != "1585/A" || item.DifficultyScale != DifficultyScaleCodeforces {
		t.Fatalf("item = %+v", item)
	}
	if item.Tags[0].Name != "implementation" || item.Tags[0].Source != TagSourceCodeforcesOfficial || item.Tags[0].Confidence != 1 {
		t.Fatalf("tags = %+v", item.Tags)
	}
}
