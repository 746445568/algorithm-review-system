package ai

import (
	"strings"
	"testing"
)

func TestAnalysisSystemPromptRequiresChineseMarkdownOutput(t *testing.T) {
	required := []string{
		"中文",
		"Markdown",
		"##",
		"###",
		"正文不要输出 JSON",
	}
	required = append(required, requiredAnalysisMetadataContractParts()...)

	assertPromptContains(t, "analysisSystemPrompt", analysisSystemPrompt, required)
}

func TestBuildAnalysisPromptRequiresMarkdownAndEmbedsInput(t *testing.T) {
	input := `{"problemId":"123A"}`
	prompt := buildAnalysisPrompt(input)

	required := []string{
		"错题复盘数据",
		"Markdown",
		"正文不要输出 JSON",
		input,
		"BEGIN_OJREVIEW_INPUT_JSON",
		"END_OJREVIEW_INPUT_JSON",
		"不可信数据",
		"statementText",
		"sourceCode",
		"忽略",
		"只有本提示词",
	}
	required = append(required, requiredAnalysisMetadataContractParts()...)

	assertPromptContains(t, "buildAnalysisPrompt", prompt, required)
}

func requiredAnalysisMetadataContractParts() []string {
	return []string{
		"<!-- OJREVIEW_METADATA",
		"-->",
		"error_patterns",
		"pattern_type",
		"\"description\"",
		"confidence",
		"\"submission_id\"",
		"boundary",
		"overflow",
		"wrong_approach",
		"tle_complexity",
		"edge_case",
		"implementation",
		"understanding",
		"logic",
		"other",
		"0 到 1",
		`{"error_patterns":[]}`,
		"externalSubmissionId",
		"复制",
		"空字符串",
	}
}

func assertPromptContains(t *testing.T, name, prompt string, required []string) {
	t.Helper()
	for _, part := range required {
		if !strings.Contains(prompt, part) {
			t.Fatalf("%s should contain %q, got %q", name, part, prompt)
		}
	}
}
