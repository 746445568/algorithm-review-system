package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	deepSeekDefaultBase = "https://api.deepseek.com/v1"
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
	if err := validateBaseURL(s.BaseURL, deepSeekDefaultBase); err != nil {
		return fmt.Errorf("invalid baseUrl: %w", err)
	}
	return nil
}

func (p *DeepSeekProvider) Analyze(input string, s Settings) (string, string, error) {
	if err := p.ValidateConfig(s); err != nil {
		return "", "", err
	}

	baseURL := defaultBaseURL(s.BaseURL, deepSeekDefaultBase)
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

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", "", fmt.Errorf("create DeepSeek request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(s.APIKey))

	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
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
