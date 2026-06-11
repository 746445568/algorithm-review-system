package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestExtractAnalysisMetadata_StripsMetadataAndParsesPatterns(t *testing.T) {
	input := `## Watermelon

### 错误原因
边界条件没有处理。

<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"boundary","description":"n=2 时分支错误","confidence":0.87,"submission_id":"123456"}]}
-->`

	clean, patterns := extractAnalysisMetadata(input, 42)
	if clean != "## Watermelon\n\n### 错误原因\n边界条件没有处理。\n\n" {
		t.Fatalf("clean text = %q", clean)
	}
	if len(patterns) != 1 {
		t.Fatalf("len(patterns) = %d, want 1", len(patterns))
	}
	if patterns[0].PatternType != "boundary" {
		t.Fatalf("PatternType = %q, want boundary", patterns[0].PatternType)
	}
	if patterns[0].Description != "n=2 时分支错误" {
		t.Fatalf("Description = %q", patterns[0].Description)
	}
	if patterns[0].Confidence != 0.87 {
		t.Fatalf("Confidence = %v, want 0.87", patterns[0].Confidence)
	}
	if patterns[0].SubmissionID != "123456" {
		t.Fatalf("SubmissionID = %q, want 123456", patterns[0].SubmissionID)
	}
	if patterns[0].ProblemID != 42 {
		t.Fatalf("ProblemID = %d, want 42", patterns[0].ProblemID)
	}
}

func TestExtractAnalysisMetadata_NoBlockPreservesWhitespace(t *testing.T) {
	input := "  \n## Plain Markdown\n\nNo metadata.\n\n  "

	clean, patterns := extractAnalysisMetadata(input, 42)
	if clean != input {
		t.Fatalf("clean text = %q, want original", clean)
	}
	if len(patterns) != 0 {
		t.Fatalf("len(patterns) = %d, want 0", len(patterns))
	}
}

func TestExtractAnalysisMetadata_NormalizesAliasesAndConfidence(t *testing.T) {
	input := `Body
<!-- OJREVIEW_METADATA
{"error_patterns":[{"type":"overflow","description":"int 溢出","ai_confidence":1.7},{"pattern_type":"","description":"ignored","confidence":0.5}]}
-->`

	_, patterns := extractAnalysisMetadata(input, 42)
	if len(patterns) != 1 {
		t.Fatalf("len(patterns) = %d, want 1", len(patterns))
	}
	if patterns[0].PatternType != "overflow" {
		t.Fatalf("PatternType = %q, want overflow", patterns[0].PatternType)
	}
	if patterns[0].Confidence != 1 {
		t.Fatalf("Confidence = %v, want 1", patterns[0].Confidence)
	}
}

func TestExtractAnalysisMetadata_NonWhitespaceAfterMetadataPreservesOriginalContent(t *testing.T) {
	input := `Intro
<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"first","description":"ignored","confidence":0.25}]}
-->
Middle
<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"final","description":"kept","confidence":0.75}]}
-->
Tail`

	clean, patterns := extractAnalysisMetadata(input, 99)
	if clean != input {
		t.Fatalf("clean text = %q, want original", clean)
	}
	if len(patterns) != 0 {
		t.Fatalf("len(patterns) = %d, want 0", len(patterns))
	}
}

func TestExtractAnalysisMetadata_AllowsTrailingWhitespaceAfterFinalMetadataBlock(t *testing.T) {
	input := `Intro
<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"first","description":"ignored","confidence":0.25}]}
-->
Middle
<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"final","description":"kept","confidence":0.75}]}
-->` + "\n  \n\t"

	clean, patterns := extractAnalysisMetadata(input, 99)
	wantClean := `Intro
<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"first","description":"ignored","confidence":0.25}]}
-->
Middle
` + "\n  \n\t"
	if clean != wantClean {
		t.Fatalf("clean text = %q, want %q", clean, wantClean)
	}
	if len(patterns) != 1 {
		t.Fatalf("len(patterns) = %d, want 1", len(patterns))
	}
	if patterns[0].PatternType != "final" {
		t.Fatalf("PatternType = %q, want final", patterns[0].PatternType)
	}
	if patterns[0].ProblemID != 99 {
		t.Fatalf("ProblemID = %d, want 99", patterns[0].ProblemID)
	}
}

func TestExtractAnalysisMetadata_InvalidJSONPreservesOriginalContent(t *testing.T) {
	input := `Body
<!-- OJREVIEW_METADATA
{"error_patterns":[}
-->
Footer`

	clean, patterns := extractAnalysisMetadata(input, 42)
	if clean != input {
		t.Fatalf("clean text = %q, want original", clean)
	}
	if len(patterns) != 0 {
		t.Fatalf("len(patterns) = %d, want 0", len(patterns))
	}
}

func TestExtractAnalysisMetadata_MissingClosingMarkerPreservesOriginalContent(t *testing.T) {
	input := `Body
<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"boundary"}]}`

	clean, patterns := extractAnalysisMetadata(input, 42)
	if clean != input {
		t.Fatalf("clean text = %q, want original", clean)
	}
	if len(patterns) != 0 {
		t.Fatalf("len(patterns) = %d, want 0", len(patterns))
	}
}

func TestRunAnalysisTask_ProblemSnapshotStripsMetadataAndPersistsPatterns(t *testing.T) {
	server := newTestServer(t)
	provider := newAnalysisProviderServer(t, `## Watermelon

### 错误原因
边界条件没有处理。

<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"boundary","description":"n=2 时分支错误","confidence":0.87,"submission_id":"123456"}]}
-->`)
	defer provider.Close()

	if err := server.db.SaveAISettings(models.AISettings{
		Provider: "deepseek",
		Model:    "deepseek-chat",
		BaseURL:  provider.URL,
		APIKey:   "test-key",
	}); err != nil {
		t.Fatalf("save AI settings: %v", err)
	}

	problem, err := server.db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	problemID := problem.ID
	task, _, err := server.db.CreateAnalysisTaskWithTypedSnapshot("deepseek", "deepseek-chat", `{"summary":"ok"}`, "problem", &problemID)
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	if err := server.runAnalysisTask(context.Background(), task.ID); err != nil {
		t.Fatalf("run analysis task: %v", err)
	}

	finished, err := server.db.GetAnalysisTask(task.ID)
	if err != nil {
		t.Fatalf("get task: %v", err)
	}
	if finished.Status != models.TaskSuccess {
		t.Fatalf("status = %s, want %s: %s", finished.Status, models.TaskSuccess, finished.ErrorMessage)
	}
	if strings.Contains(finished.ResultText, analysisMetadataStart) {
		t.Fatalf("result text still contains metadata: %q", finished.ResultText)
	}
	if finished.ResultText != "## Watermelon\n\n### 错误原因\n边界条件没有处理。\n\n" {
		t.Fatalf("result text = %q", finished.ResultText)
	}

	patterns, err := server.db.GetErrorPatternsByProblem(problemID)
	if err != nil {
		t.Fatalf("get error patterns: %v", err)
	}
	if len(patterns) != 1 {
		t.Fatalf("len(patterns) = %d, want 1", len(patterns))
	}
	if patterns[0].PatternType != "boundary" {
		t.Fatalf("PatternType = %q, want boundary", patterns[0].PatternType)
	}
	if patterns[0].Description != "n=2 时分支错误" {
		t.Fatalf("Description = %q, want n=2 时分支错误", patterns[0].Description)
	}
	if patterns[0].Confidence != 0.87 {
		t.Fatalf("Confidence = %v, want 0.87", patterns[0].Confidence)
	}
	if patterns[0].SubmissionID != "123456" {
		t.Fatalf("SubmissionID = %q, want 123456", patterns[0].SubmissionID)
	}
}

func TestRunAnalysisTask_GlobalSnapshotDoesNotStripOrPersistMetadata(t *testing.T) {
	server := newTestServer(t)
	resultText := `## 全局分析

<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"boundary","description":"should stay in markdown","confidence":0.87}]}
-->`
	provider := newAnalysisProviderServer(t, resultText)
	defer provider.Close()

	if err := server.db.SaveAISettings(models.AISettings{
		Provider: "deepseek",
		Model:    "deepseek-chat",
		BaseURL:  provider.URL,
		APIKey:   "test-key",
	}); err != nil {
		t.Fatalf("save AI settings: %v", err)
	}

	task, _, err := server.db.CreateAnalysisTaskWithTypedSnapshot("deepseek", "deepseek-chat", `{"summary":"ok"}`, "global", nil)
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	problemID, err := server.db.GetReviewSnapshotProblemID(task.InputSnapshotID)
	if err != nil {
		t.Fatalf("get snapshot problem id: %v", err)
	}
	if problemID != nil {
		t.Fatalf("problemID = %d, want nil", *problemID)
	}

	if err := server.runAnalysisTask(context.Background(), task.ID); err != nil {
		t.Fatalf("run analysis task: %v", err)
	}

	finished, err := server.db.GetAnalysisTask(task.ID)
	if err != nil {
		t.Fatalf("get task: %v", err)
	}
	if finished.Status != models.TaskSuccess {
		t.Fatalf("status = %s, want %s: %s", finished.Status, models.TaskSuccess, finished.ErrorMessage)
	}
	if finished.ResultText != resultText {
		t.Fatalf("result text = %q, want original %q", finished.ResultText, resultText)
	}

	patterns, err := server.db.GetErrorPatternsByProblem(42)
	if err != nil {
		t.Fatalf("get error patterns: %v", err)
	}
	if len(patterns) != 0 {
		t.Fatalf("len(patterns) = %d, want 0", len(patterns))
	}
}

func TestRunAnalysisTask_InvalidOrMissingMetadataPreservesExistingPatterns(t *testing.T) {
	testCases := []struct {
		name       string
		resultText string
	}{
		{
			name:       "missing metadata",
			resultText: "## Analysis\n\nNo metadata.",
		},
		{
			name: "invalid metadata",
			resultText: `## Analysis

<!-- OJREVIEW_METADATA
{"error_patterns":[}
-->`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			server := newTestServer(t)
			provider := newAnalysisProviderServer(t, testCase.resultText)
			defer provider.Close()

			if err := server.db.SaveAISettings(models.AISettings{
				Provider: "deepseek",
				Model:    "deepseek-chat",
				BaseURL:  provider.URL,
				APIKey:   "test-key",
			}); err != nil {
				t.Fatalf("save AI settings: %v", err)
			}

			problem, err := server.db.UpsertProblem(models.Problem{
				Platform:          models.PlatformCodeforces,
				ExternalProblemID: "1000/A",
				Title:             "A",
			})
			if err != nil {
				t.Fatalf("upsert problem: %v", err)
			}
			if err := server.db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{
				{PatternType: "boundary", Description: "existing", Confidence: 0.75},
			}); err != nil {
				t.Fatalf("seed error patterns: %v", err)
			}

			problemID := problem.ID
			task, _, err := server.db.CreateAnalysisTaskWithTypedSnapshot(
				"deepseek",
				"deepseek-chat",
				`{"summary":"ok"}`,
				"problem",
				&problemID,
			)
			if err != nil {
				t.Fatalf("create task: %v", err)
			}

			if err := server.runAnalysisTask(context.Background(), task.ID); err != nil {
				t.Fatalf("run analysis task: %v", err)
			}

			finished, err := server.db.GetAnalysisTask(task.ID)
			if err != nil {
				t.Fatalf("get task: %v", err)
			}
			if finished.Status != models.TaskSuccess {
				t.Fatalf("status = %s, want %s: %s", finished.Status, models.TaskSuccess, finished.ErrorMessage)
			}
			if finished.ResultText != testCase.resultText {
				t.Fatalf("result text = %q, want original %q", finished.ResultText, testCase.resultText)
			}

			patterns, err := server.db.GetErrorPatternsByProblem(problem.ID)
			if err != nil {
				t.Fatalf("get error patterns: %v", err)
			}
			if len(patterns) != 1 {
				t.Fatalf("len(patterns) = %d, want 1", len(patterns))
			}
			if patterns[0].PatternType != "boundary" || patterns[0].Description != "existing" {
				t.Fatalf("patterns[0] = %#v, want existing boundary pattern", patterns[0])
			}
		})
	}
}

func TestRunAnalysisTask_ValidEmptyMetadataClearsExistingPatterns(t *testing.T) {
	server := newTestServer(t)
	resultText := `## Analysis

<!-- OJREVIEW_METADATA
{"error_patterns":[]}
-->`
	provider := newAnalysisProviderServer(t, resultText)
	defer provider.Close()

	if err := server.db.SaveAISettings(models.AISettings{
		Provider: "deepseek",
		Model:    "deepseek-chat",
		BaseURL:  provider.URL,
		APIKey:   "test-key",
	}); err != nil {
		t.Fatalf("save AI settings: %v", err)
	}

	problem, err := server.db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	if err := server.db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{
		{PatternType: "boundary", Description: "existing", Confidence: 0.75},
	}); err != nil {
		t.Fatalf("seed error patterns: %v", err)
	}

	problemID := problem.ID
	task, _, err := server.db.CreateAnalysisTaskWithTypedSnapshot(
		"deepseek",
		"deepseek-chat",
		`{"summary":"ok"}`,
		"problem",
		&problemID,
	)
	if err != nil {
		t.Fatalf("create task: %v", err)
	}

	if err := server.runAnalysisTask(context.Background(), task.ID); err != nil {
		t.Fatalf("run analysis task: %v", err)
	}

	finished, err := server.db.GetAnalysisTask(task.ID)
	if err != nil {
		t.Fatalf("get task: %v", err)
	}
	if finished.Status != models.TaskSuccess {
		t.Fatalf("status = %s, want %s: %s", finished.Status, models.TaskSuccess, finished.ErrorMessage)
	}
	if strings.Contains(finished.ResultText, analysisMetadataStart) {
		t.Fatalf("result text still contains metadata: %q", finished.ResultText)
	}

	patterns, err := server.db.GetErrorPatternsByProblem(problem.ID)
	if err != nil {
		t.Fatalf("get error patterns: %v", err)
	}
	if len(patterns) != 0 {
		t.Fatalf("len(patterns) = %d, want 0", len(patterns))
	}
}

func TestErrorPatternStats_ReturnsPersistedPatterns(t *testing.T) {
	server := newTestServer(t)
	problem, err := server.db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	if err := server.db.SaveErrorPatterns(problem.ID, []models.ErrorPattern{
		{PatternType: "boundary", Confidence: 0.8},
		{PatternType: "boundary", Confidence: 1.0},
	}); err != nil {
		t.Fatalf("save error patterns: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/error-patterns/stats", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var stats []struct {
		PatternType   string  `json:"pattern_type"`
		Count         int     `json:"count"`
		AvgConfidence float64 `json:"avg_confidence"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&stats); err != nil {
		t.Fatalf("decode stats: %v", err)
	}
	if len(stats) != 1 {
		t.Fatalf("len(stats) = %d, want 1", len(stats))
	}
	if stats[0].PatternType != "boundary" {
		t.Fatalf("PatternType = %q, want boundary", stats[0].PatternType)
	}
	if stats[0].Count != 2 {
		t.Fatalf("Count = %d, want 2", stats[0].Count)
	}
	if stats[0].AvgConfidence != 0.9 {
		t.Fatalf("AvgConfidence = %v, want 0.9", stats[0].AvgConfidence)
	}
}

func newAnalysisProviderServer(t *testing.T, resultText string) *httptest.Server {
	t.Helper()

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			http.Error(w, "unexpected path: "+r.URL.Path, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"content": resultText}},
			},
		}); err != nil {
			t.Fatalf("encode response: %v", err)
		}
	}))
}
