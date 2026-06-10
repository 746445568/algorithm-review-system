package api

import "testing"

func TestExtractAnalysisMetadata_StripsMetadataAndParsesPatterns(t *testing.T) {
	input := `## Watermelon

### 错误原因
边界条件没有处理。

<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"boundary","description":"n=2 时分支错误","confidence":0.87,"submission_id":"123456"}]}
-->`

	clean, patterns, err := extractAnalysisMetadata(input)
	if err != nil {
		t.Fatalf("extract metadata: %v", err)
	}
	if clean != "## Watermelon\n\n### 错误原因\n边界条件没有处理。" {
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
}

func TestExtractAnalysisMetadata_NoBlockKeepsText(t *testing.T) {
	input := "## Plain Markdown\n\nNo metadata."

	clean, patterns, err := extractAnalysisMetadata(input)
	if err != nil {
		t.Fatalf("extract metadata: %v", err)
	}
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

	_, patterns, err := extractAnalysisMetadata(input)
	if err != nil {
		t.Fatalf("extract metadata: %v", err)
	}
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
