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
		"不要输出 JSON",
	}

	for _, part := range required {
		if !strings.Contains(analysisSystemPrompt, part) {
			t.Fatalf("analysisSystemPrompt should contain %q, got %q", part, analysisSystemPrompt)
		}
	}
}

func TestBuildAnalysisPromptRequiresMarkdownAndEmbedsInput(t *testing.T) {
	input := `{"problemId":"123A"}`
	prompt := buildAnalysisPrompt(input)

	required := []string{
		"错题复盘数据",
		"Markdown",
		"不要输出 JSON",
		input,
	}

	for _, part := range required {
		if !strings.Contains(prompt, part) {
			t.Fatalf("buildAnalysisPrompt should contain %q, got %q", part, prompt)
		}
	}
}
