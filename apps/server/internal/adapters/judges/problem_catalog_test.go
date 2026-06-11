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

func TestAtCoderFetchProblemCatalogMergesDifficulty(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/resources/problems.json", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]atCoderProblem{{
			ID: "abc300_d", Title: "D. AABCC", ContestID: "abc300", ProblemIndex: "D",
		}})
	})
	mux.HandleFunc("/resources/merged-problems.json", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]atCoderMergedProblem{{
			ID: "abc300_d", ContestID: "abc300", ProblemIndex: "D", Title: "D. AABCC", SolverCount: intPtrForJudgeTest(10000),
		}})
	})
	mux.HandleFunc("/resources/problem-models.json", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]atCoderProblemModel{
			"abc300_d": {Difficulty: intPtrForJudgeTest(1200), IsExperimental: false},
		})
	})
	mux.HandleFunc("/resources/contest-problem.json", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]atCoderContestProblem{{
			ContestID: "abc300", ProblemID: "abc300_d", ProblemIndex: "D",
		}})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	adapter := &AtCoderAdapter{
		client:          server.Client(),
		resourceBaseURL: server.URL + "/resources",
		requestSpacing:  0,
	}
	items, err := adapter.FetchProblemCatalog(context.Background())
	if err != nil {
		t.Fatalf("fetch atcoder catalog: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1", len(items))
	}
	item := items[0]
	if item.Platform != models.PlatformAtCoder || item.ExternalProblemID != "abc300_d" || item.DifficultyScale != DifficultyScaleAtCoder {
		t.Fatalf("item = %+v", item)
	}
	if item.DifficultyValue == nil || *item.DifficultyValue != 1200 {
		t.Fatalf("difficulty = %+v, want 1200", item.DifficultyValue)
	}
	if len(item.Tags) != 1 || item.Tags[0].Name != "ABC" || item.Tags[0].Source != TagSourceAtCoderContestCategory {
		t.Fatalf("tags = %+v", item.Tags)
	}
}

func intPtrForJudgeTest(v int) *int { return &v }
