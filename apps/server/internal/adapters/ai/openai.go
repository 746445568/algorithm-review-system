package ai

import (
	"bytes"
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
	analysisSystemPrompt = "Analyze this competitive programming review data and provide insights. Highlight weak areas, repeated failure patterns, and concrete next practice steps."
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

func (p *OpenAIProvider) Analyze(input string, s Settings) (string, string, error) {
	return analyzeOpenAICompatible(input, s, "openai", defaultOpenAIBaseURL)
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

func analyzeOpenAICompatible(input string, s Settings, expectedProvider, defaultBaseURL string) (string, string, error) {
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

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", "", fmt.Errorf("create HTTP request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(s.APIKey))

	client := &http.Client{Timeout: 60 * time.Second}
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
	return fmt.Sprintf("Review data JSON:\n%s", input)
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
