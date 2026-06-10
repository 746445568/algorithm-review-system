package api

import "testing"

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
-->
  
	`

	clean, patterns := extractAnalysisMetadata(input, 99)
	wantClean := `Intro
<!-- OJREVIEW_METADATA
{"error_patterns":[{"pattern_type":"first","description":"ignored","confidence":0.25}]}
-->
Middle

  
	`
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
