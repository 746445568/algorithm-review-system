package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	defaultOpenAIBaseURL = "https://api.openai.com/v1"
	analysisSystemPrompt = `你是一位算法竞赛教练。对于每道错题，请按照以下步骤分析：

1. **查找题面**：根据平台(platform)、题目ID(externalProblemId)、标题(title)和标签(tags)，请回忆或推断这道题的题面内容。你可以搜索Codeforces、AtCoder等平台的题目。

2. **理解题意**：简述题目要求什么，输入输出格式，数据范围。

3. **分析错误**：查看用户的错误提交代码，找出WA/TLE/RE等错误的原因。

4. **给出思路**：详细讲解正确的解题思路，包括：
   - 使用什么算法/数据结构
   - 关键思路和技巧
   - 时间/空间复杂度分析

5. **给出代码**：提供一份正确的代码实现（使用C++，因为大多数OJ支持C++）。

请用中文输出Markdown格式，每道题用 ## 题目标题 分隔，使用 ### 作为小节标题，**加粗**标注关键词。**不要输出 JSON**。`
)

type OpenAIProvider struct{}

type openAIChatCompletionRequest struct {
	Model       string              `json:"model"`
	Messages    []openAIChatMessage `json:"messages"`
	Temperature float64             `json:"temperature"`
}

type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIChatCompletionResponse struct {
	Choices []struct {
		Message openAIChatMessage `json:"message"`
	} `json:"choices"`
}

func (p *OpenAIProvider) ValidateConfig(s Settings) error {
	return validateOpenAICompatibleConfig(s, "openai", defaultOpenAIBaseURL)
}

func (p *OpenAIProvider) Analyze(ctx context.Context, input string, s Settings) (string, string, error) {
	return analyzeOpenAICompatible(ctx, input, s, "openai", defaultOpenAIBaseURL)
}

func validateOpenAICompatibleConfig(s Settings, expectedProvider, defaultBaseURL string) error {
	provider := normalizeProviderName(s.Provider)
	if provider != expectedProvider {
		return fmt.Errorf("unsupported provider %q for %s provider", s.Provider, expectedProvider)
	}

	if strings.TrimSpace(s.Model) == "" {
		return fmt.Errorf("model is required")
	}

	if strings.TrimSpace(s.APIKey) == "" {
		return fmt.Errorf("apiKey is required for %s provider", expectedProvider)
	}

	if _, err := normalizeBaseURL(s.BaseURL, defaultBaseURL); err != nil {
		return fmt.Errorf("invalid baseUrl: %w", err)
	}

	return nil
}

func analyzeOpenAICompatible(ctx context.Context, input string, s Settings, expectedProvider, defaultBaseURL string) (string, string, error) {
	if err := validateOpenAICompatibleConfig(s, expectedProvider, defaultBaseURL); err != nil {
		return "", "", err
	}

	baseURL, err := normalizeBaseURL(s.BaseURL, defaultBaseURL)
	if err != nil {
		return "", "", fmt.Errorf("resolve baseUrl: %w", err)
	}

	endpoint, err := url.JoinPath(baseURL, "chat/completions")
	if err != nil {
		return "", "", fmt.Errorf("build endpoint URL: %w", err)
	}

	reqBody := openAIChatCompletionRequest{
		Model: s.Model,
		Messages: []openAIChatMessage{
			{
				Role:    "system",
				Content: analysisSystemPrompt,
			},
			{
				Role:    "user",
				Content: buildAnalysisPrompt(input),
			},
		},
		Temperature: 0.7,
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", "", fmt.Errorf("marshal request body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", "", fmt.Errorf("create HTTP request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(s.APIKey))

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("perform API request: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("read API response: %w", err)
	}
	rawJSON := string(rawBody)

	if resp.StatusCode != http.StatusOK {
		return "", rawJSON, fmt.Errorf("%s API request failed with status %d: %s", expectedProvider, resp.StatusCode, strings.TrimSpace(rawJSON))
	}

	var parsed openAIChatCompletionResponse
	if err := json.Unmarshal(rawBody, &parsed); err != nil {
		return "", rawJSON, fmt.Errorf("parse API response JSON: %w", err)
	}

	if len(parsed.Choices) == 0 {
		return "", rawJSON, fmt.Errorf("%s API response missing choices", expectedProvider)
	}

	analysis := parsed.Choices[0].Message.Content
	if strings.TrimSpace(analysis) == "" {
		return "", rawJSON, fmt.Errorf("%s API response contains empty analysis content", expectedProvider)
	}

	return analysis, rawJSON, nil
}

func buildAnalysisPrompt(input string) string {
	return fmt.Sprintf(`以下是错题复盘数据（JSON 格式）。每道题包含：
- platform: 平台（codeforces/atcoder）
- externalProblemId: 题目ID（如 "1900/A" 表示 Codeforces 1900A）
- title: 题目标题
- difficulty: 难度（rating）
- tags: 知识点标签
- submissions: 错误提交记录（包含代码、结果、耗时等）

请根据这些信息查找题面，分析错误原因，给出解题思路和正确代码。**请用中文 Markdown 格式输出，不要输出 JSON**：

%s`, input)
}

func normalizeBaseURL(rawBaseURL, defaultBaseURL string) (string, error) {
	base := strings.TrimSpace(rawBaseURL)
	if base == "" {
		base = defaultBaseURL
	}

	parsed, err := url.Parse(base)
	if err != nil {
		return "", err
	}

	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("baseUrl must include scheme and host")
	}

	return strings.TrimRight(parsed.String(), "/"), nil
}
