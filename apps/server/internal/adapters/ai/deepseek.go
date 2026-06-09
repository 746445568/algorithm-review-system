package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const (
	deepSeekDefaultBase = "https://api.deepseek.com"
)

type DeepSeekProvider struct{}

func (p *DeepSeekProvider) ValidateConfig(s Settings) error {
	if normalizeProviderName(s.Provider) != deepSeekProviderName {
		return fmt.Errorf("unsupported provider for DeepSeek provider: %q", s.Provider)
	}
	if strings.TrimSpace(s.Model) == "" {
		return fmt.Errorf("model is required")
	}
	if strings.TrimSpace(s.APIKey) == "" {
		return fmt.Errorf("apiKey is required for %s", deepSeekProviderName)
	}
	if _, err := normalizeDeepSeekOpenAIBaseURL(s.BaseURL); err != nil {
		return fmt.Errorf("invalid baseUrl: %w", err)
	}
	return nil
}

func (p *DeepSeekProvider) Analyze(ctx context.Context, input string, s Settings) (string, string, error) {
	if err := p.ValidateConfig(s); err != nil {
		return "", "", err
	}

	baseURL, err := normalizeDeepSeekOpenAIBaseURL(s.BaseURL)
	if err != nil {
		return "", "", fmt.Errorf("resolve DeepSeek baseUrl: %w", err)
	}
	endpoint, err := buildEndpoint(baseURL, "/chat/completions")
	if err != nil {
		return "", "", err
	}

	payload := map[string]any{
		"model": s.Model,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": analysisSystemPrompt,
			},
			{
				"role":    "user",
				"content": analysisUserPrompt(input),
			},
		},
		"temperature": 0.7,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", fmt.Errorf("marshal DeepSeek request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", "", fmt.Errorf("create DeepSeek request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(s.APIKey))

	resp, err := analysisClient.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("DeepSeek request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("read DeepSeek response: %w", err)
	}
	rawJSON := string(raw)

	if resp.StatusCode != http.StatusOK {
		return "", rawJSON, fmt.Errorf("DeepSeek API returned status %d: %s", resp.StatusCode, strings.TrimSpace(rawJSON))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", rawJSON, fmt.Errorf("parse DeepSeek response JSON: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return "", rawJSON, fmt.Errorf("DeepSeek response missing choices")
	}

	result := strings.TrimSpace(parsed.Choices[0].Message.Content)
	if result == "" {
		return "", rawJSON, fmt.Errorf("DeepSeek response missing message content")
	}

	return result, rawJSON, nil
}

func normalizeDeepSeekOpenAIBaseURL(rawBaseURL string) (string, error) {
	baseURL, err := normalizeBaseURL(rawBaseURL, deepSeekDefaultBase)
	if err != nil {
		return "", err
	}

	const anthropicPath = "/anthropic"
	if strings.HasSuffix(baseURL, anthropicPath) {
		baseURL = strings.TrimSuffix(baseURL, anthropicPath)
	}

	return strings.TrimRight(baseURL, "/"), nil
}
