package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestKnowledgeGraph_EmptyDB(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/knowledge-graph", nil)
	rec := httptest.NewRecorder()

	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Nodes == nil {
		t.Fatalf("expected non-nil nodes")
	}
	if len(body.Nodes) != 0 {
		t.Fatalf("len(nodes) = %d, want 0", len(body.Nodes))
	}
}

func TestKnowledgeGraphSync_CreatesNodesFromProblemTags(t *testing.T) {
	server := newTestServer(t)
	if _, err := server.db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "Tagged Problem",
		RawTagsJSON:       `["dp","greedy"]`,
	}); err != nil {
		t.Fatalf("upsert problem: %v", err)
	}

	syncReq := httptest.NewRequest(http.MethodPost, "/api/knowledge-graph/sync", nil)
	syncRec := httptest.NewRecorder()
	server.Router().ServeHTTP(syncRec, syncReq)

	if syncRec.Code != http.StatusOK {
		t.Fatalf("sync status = %d, want %d; body=%s", syncRec.Code, http.StatusOK, syncRec.Body.String())
	}
	var syncBody struct {
		NodesCreated int `json:"nodesCreated"`
		LinksCreated int `json:"linksCreated"`
	}
	if err := json.NewDecoder(syncRec.Body).Decode(&syncBody); err != nil {
		t.Fatalf("decode sync response: %v", err)
	}
	if syncBody.NodesCreated != 2 {
		t.Fatalf("nodesCreated = %d, want 2", syncBody.NodesCreated)
	}
	if syncBody.LinksCreated != 2 {
		t.Fatalf("linksCreated = %d, want 2", syncBody.LinksCreated)
	}

	graphReq := httptest.NewRequest(http.MethodGet, "/api/knowledge-graph", nil)
	graphRec := httptest.NewRecorder()
	server.Router().ServeHTTP(graphRec, graphReq)
	if graphRec.Code != http.StatusOK {
		t.Fatalf("graph status = %d, want %d; body=%s", graphRec.Code, http.StatusOK, graphRec.Body.String())
	}
	var graphBody struct {
		Nodes []struct {
			Name         string `json:"name"`
			ProblemCount int    `json:"problemCount"`
		} `json:"nodes"`
	}
	if err := json.NewDecoder(graphRec.Body).Decode(&graphBody); err != nil {
		t.Fatalf("decode graph response: %v", err)
	}
	counts := map[string]int{}
	for _, node := range graphBody.Nodes {
		counts[node.Name] = node.ProblemCount
	}
	if counts["dp"] != 1 {
		t.Fatalf("dp problemCount = %d, want 1", counts["dp"])
	}
	if counts["greedy"] != 1 {
		t.Fatalf("greedy problemCount = %d, want 1", counts["greedy"])
	}
}
