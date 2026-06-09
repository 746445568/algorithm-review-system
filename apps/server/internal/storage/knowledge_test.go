package storage

import (
	"testing"

	"ojreviewdesktop/internal/models"
)

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

	// Insert test data: account + problems with tags + submissions
	_, err := db.UpsertAccount(models.PlatformCodeforces, "kg_test")
	if err != nil {
		t.Fatalf("upsert account: %v", err)
	}

	// Insert problems
	for i, title := range []string{"Problem A", "Problem B", "Problem C"} {
		_, err = db.conn.Exec(
			`INSERT INTO problems (platform, external_problem_id, title, raw_tags_json) VALUES ('CODEFORCES', ?, ?, '[]')`,
			i+1, title,
		)
		if err != nil {
			t.Fatalf("insert problem %d: %v", i, err)
		}
	}

	// Insert tags for problems
	tags := []struct {
		problemID int
		tagName   string
	}{
		{1, "dp"},
		{1, "greedy"},
		{2, "dp"},
		{2, "binary search"},
		{3, "greedy"},
		{3, "math"},
	}
	for _, tag := range tags {
		_, err = db.conn.Exec(
			`INSERT INTO problem_tags (problem_id, tag_name, tag_source) VALUES (?, ?, 'platform_raw')`,
			tag.problemID, tag.tagName,
		)
		if err != nil {
			t.Fatalf("insert tag %s for problem %d: %v", tag.tagName, tag.problemID, err)
		}
	}

	// Insert submissions with verdicts
	submissions := []struct {
		problemID int
		verdict   string
		extID     string
	}{
		{1, "ACCEPTED", "s1"},
		{1, "WRONG_ANSWER", "s2"},
		{2, "WRONG_ANSWER", "s3"},
		{2, "TIME_LIMIT_EXCEEDED", "s4"},
		{3, "ACCEPTED", "s5"},
	}
	for _, sub := range submissions {
		_, err = db.conn.Exec(
			`INSERT INTO submissions (platform, external_submission_id, platform_account_id, problem_id, verdict, language, submitted_at, raw_json) VALUES ('CODEFORCES', ?, 1, ?, ?, 'C++', '2026-06-09T00:00:00Z', '{}')`,
			sub.extID, sub.problemID, sub.verdict,
		)
		if err != nil {
			t.Fatalf("insert submission %s: %v", sub.extID, err)
		}
	}

	// Sync tags to knowledge graph
	nodes, links, err := db.SyncTagsToKnowledgeGraph()
	if err != nil {
		t.Fatalf("SyncTagsToKnowledgeGraph: %v", err)
	}

	// Should have created 4 knowledge nodes: dp, greedy, binary search, math
	if nodes != 4 {
		t.Fatalf("expected 4 knowledge nodes, got %d", nodes)
	}

	// Should have created 6 problem-knowledge links (2+2+1+1)
	if links != 6 {
		t.Fatalf("expected 6 links, got %d", links)
	}

	// Verify graph data
	graph, err := db.GetKnowledgeGraph()
	if err != nil {
		t.Fatalf("GetKnowledgeGraph: %v", err)
	}
	if len(graph) != 4 {
		t.Fatalf("expected 4 graph nodes, got %d", len(graph))
	}

	// Find the "dp" node and verify mastery
	// Problem 1 (dp): 1 AC / 2 total = 0.5
	// Problem 2 (dp): 0 AC / 2 total = 0.0
	// Average mastery for "dp" = 0.25
	for _, node := range graph {
		if node["name"] == "dp" {
			count := toInt(node["problemCount"])
			if count != 2 {
				t.Fatalf("dp: expected problemCount=2, got %d", count)
			}
			mastery, _ := node["avgMastery"].(float64)
			// mastery = avg of [0.5, 0.0] = 0.25
			if mastery < 0.24 || mastery > 0.26 {
				t.Fatalf("dp: expected avgMastery≈0.25, got %f", mastery)
			}
		}
		if node["name"] == "greedy" {
			count := toInt(node["problemCount"])
			if count != 2 {
				t.Fatalf("greedy: expected problemCount=2, got %d", count)
			}
		}
	}

	// Idempotent: calling sync again should create 0 new nodes/links
	nodes2, links2, err := db.SyncTagsToKnowledgeGraph()
	if err != nil {
		t.Fatalf("second SyncTagsToKnowledgeGraph: %v", err)
	}
	if nodes2 != 0 || links2 != 0 {
		t.Fatalf("idempotent: expected 0 new, got nodes=%d links=%d", nodes2, links2)
	}
}

func TestGetKnowledgeGraph_EmptyDB(t *testing.T) {
	db := openTestDBWithMigrate(t)

	graph, err := db.GetKnowledgeGraph()
	if err != nil {
		t.Fatalf("GetKnowledgeGraph: %v", err)
	}
	if len(graph) != 0 {
		t.Fatalf("expected empty graph, got %d nodes", len(graph))
	}
}

// toInt handles both int and int64 type assertions from map[string]any.
func toInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	default:
		return 0
	}
}
