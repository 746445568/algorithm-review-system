package storage

import (
	"testing"
	"time"

	"ojreviewdesktop/internal/models"
)

func openTestDBWithMigrate(t *testing.T) *DB {
	t.Helper()

	db := openTestDBNoMigrate(t)
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	return db
}

func TestSyncTagsToKnowledgeGraph_EmptyDB(t *testing.T) {
	db := openTestDBWithMigrate(t)

	nodes, links, err := db.SyncTagsToKnowledgeGraph()
	if err != nil {
		t.Fatalf("SyncTagsToKnowledgeGraph: %v", err)
	}
	if nodes != 0 || links != 0 {
		t.Fatalf("expected 0 nodes and 0 links, got nodes=%d links=%d", nodes, links)
	}
}

func TestSyncTagsToKnowledgeGraph_WithTags(t *testing.T) {
	db := openTestDBWithMigrate(t)

	problems := []models.Problem{
		{Platform: models.PlatformCodeforces, ExternalProblemID: "1000/A", Title: "Problem A", RawTagsJSON: `["dp","greedy"]`},
		{Platform: models.PlatformCodeforces, ExternalProblemID: "1000/B", Title: "Problem B", RawTagsJSON: `["dp","binary search"]`},
		{Platform: models.PlatformCodeforces, ExternalProblemID: "1000/C", Title: "Problem C", RawTagsJSON: `["greedy","math"]`},
	}
	saved := make([]models.Problem, 0, len(problems))
	for _, problem := range problems {
		item, err := db.UpsertProblem(problem)
		if err != nil {
			t.Fatalf("upsert problem %s: %v", problem.ExternalProblemID, err)
		}
		saved = append(saved, item)
	}

	submissions := []struct {
		problemID int64
		verdict   models.Verdict
		extID     string
	}{
		{saved[0].ID, models.VerdictAC, "s1"},
		{saved[0].ID, models.VerdictWA, "s2"},
		{saved[1].ID, models.VerdictWA, "s3"},
		{saved[1].ID, models.VerdictTLE, "s4"},
		{saved[2].ID, models.VerdictAC, "s5"},
	}
	for i, submission := range submissions {
		if _, err := db.UpsertSubmission(models.Submission{
			Platform:             models.PlatformCodeforces,
			ExternalSubmissionID: submission.extID,
			ProblemID:            submission.problemID,
			Verdict:              submission.verdict,
			SubmittedAt:          time.Date(2026, 6, 9, i, 0, 0, 0, time.UTC),
			RawJSON:              "{}",
		}); err != nil {
			t.Fatalf("upsert submission %s: %v", submission.extID, err)
		}
	}

	nodes, links, err := db.SyncTagsToKnowledgeGraph()
	if err != nil {
		t.Fatalf("SyncTagsToKnowledgeGraph: %v", err)
	}
	if nodes != 4 {
		t.Fatalf("expected 4 knowledge nodes, got %d", nodes)
	}
	if links != 6 {
		t.Fatalf("expected 6 links, got %d", links)
	}

	graph, err := db.GetKnowledgeGraph()
	if err != nil {
		t.Fatalf("GetKnowledgeGraph: %v", err)
	}
	if len(graph) != 4 {
		t.Fatalf("expected 4 graph nodes, got %d", len(graph))
	}

	dp := findGraphNode(t, graph, "dp")
	if count := graphInt(dp["problemCount"]); count != 2 {
		t.Fatalf("dp problemCount = %d, want 2", count)
	}
	mastery, ok := dp["avgMastery"].(float64)
	if !ok {
		t.Fatalf("dp avgMastery has type %T, want float64", dp["avgMastery"])
	}
	if mastery < 0.24 || mastery > 0.26 {
		t.Fatalf("dp avgMastery = %f, want about 0.25", mastery)
	}

	nodes, links, err = db.SyncTagsToKnowledgeGraph()
	if err != nil {
		t.Fatalf("second SyncTagsToKnowledgeGraph: %v", err)
	}
	if nodes != 0 || links != 0 {
		t.Fatalf("second sync created nodes=%d links=%d, want 0/0", nodes, links)
	}
}

func TestGetKnowledgeGraph_ReturnsNodesAndProblemCounts(t *testing.T) {
	db := openTestDBWithMigrate(t)

	graph, err := db.GetKnowledgeGraph()
	if err != nil {
		t.Fatalf("GetKnowledgeGraph empty: %v", err)
	}
	if graph == nil {
		t.Fatalf("expected non-nil empty graph")
	}
	if len(graph) != 0 {
		t.Fatalf("empty graph len = %d, want 0", len(graph))
	}

	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1001/A",
		Title:             "Graph Problem",
		RawTagsJSON:       `["graphs"]`,
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	nodeID, err := db.UpsertKnowledgeNode("graphs", nil, "graph theory")
	if err != nil {
		t.Fatalf("upsert knowledge node: %v", err)
	}
	if err := db.SaveProblemKnowledge(problem.ID, []int64{nodeID}); err != nil {
		t.Fatalf("save problem knowledge: %v", err)
	}

	graph, err = db.GetKnowledgeGraph()
	if err != nil {
		t.Fatalf("GetKnowledgeGraph populated: %v", err)
	}
	node := findGraphNode(t, graph, "graphs")
	if count := graphInt(node["problemCount"]); count != 1 {
		t.Fatalf("graphs problemCount = %d, want 1", count)
	}
	if node["description"] != "graph theory" {
		t.Fatalf("graphs description = %#v, want graph theory", node["description"])
	}
}

func TestUpdateMasteryLevels_UsesShortVerdictCodes(t *testing.T) {
	db := openTestDBWithMigrate(t)

	problem, err := db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1002/A",
		Title:             "Short Verdict Problem",
		RawTagsJSON:       `["implementation"]`,
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	nodeID, err := db.UpsertKnowledgeNode("implementation", nil, "")
	if err != nil {
		t.Fatalf("upsert knowledge node: %v", err)
	}
	if err := db.SaveProblemKnowledge(problem.ID, []int64{nodeID}); err != nil {
		t.Fatalf("save problem knowledge: %v", err)
	}

	for i, verdict := range []models.Verdict{models.VerdictAC, models.VerdictWA} {
		if _, err := db.UpsertSubmission(models.Submission{
			Platform:             models.PlatformCodeforces,
			ExternalSubmissionID: string(rune('a' + i)),
			ProblemID:            problem.ID,
			Verdict:              verdict,
			SubmittedAt:          time.Date(2026, 6, 9, i, 0, 0, 0, time.UTC),
			RawJSON:              "{}",
		}); err != nil {
			t.Fatalf("upsert submission %d: %v", i, err)
		}
	}
	if err := db.UpdateMasteryLevels(); err != nil {
		t.Fatalf("UpdateMasteryLevels: %v", err)
	}

	graph, err := db.GetKnowledgeGraph()
	if err != nil {
		t.Fatalf("GetKnowledgeGraph: %v", err)
	}
	node := findGraphNode(t, graph, "implementation")
	mastery, ok := node["avgMastery"].(float64)
	if !ok {
		t.Fatalf("avgMastery has type %T, want float64", node["avgMastery"])
	}
	if mastery < 0.49 || mastery > 0.51 {
		t.Fatalf("avgMastery = %f, want 0.5", mastery)
	}
}

func findGraphNode(t *testing.T, graph []map[string]any, name string) map[string]any {
	t.Helper()
	for _, node := range graph {
		if node["name"] == name {
			return node
		}
	}
	t.Fatalf("node %q not found in graph %#v", name, graph)
	return nil
}

func graphInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	default:
		return 0
	}
}
