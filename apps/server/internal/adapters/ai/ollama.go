package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	ollamaDefaultBase = "http://localhost:11434"
)

type OllamaProvider struct{}

func (p *OllamaProvider) ValidateConfig(s Settings) error {
	if normalizeProviderName(s.Provider) != ollamaProviderName {
		return fmt.Errorf("unsupported provider for Ollama provider: %q", s.Provider)
	}
	if strings.TrimSpace(s.Model) == "" {
		return fmt.Errorf("model is required")
	}
	if err := validateBaseURL(s.BaseURL, ollamaDefaultBase); err != nil {
		return fmt.Errorf("invalid baseUrl: %w", err)
	}
	return nil
}

func (p *OllamaProvider) Analyze(ctx context.Context, input string, s Settings) (string, string, error) {
	if err := p.ValidateConfig(s); err != nil {
		return "", "", err
	}

	baseURL := defaultBaseURL(s.BaseURL, ollamaDefaultBase)
	endpoint, err := buildEndpoint(baseURL, "/api/generate")
	if err != nil {
		return "", "", err
	}

	payload := map[string]any{
		"model":  s.Model,
		"prompt": analysisUserPrompt(input),
		"stream": false,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", "", fmt.Errorf("marshal Ollama request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", "", fmt.Errorf("create Ollama request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("Ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("read Ollama response: %w", err)
	}
	rawJSON := string(raw)

	if resp.StatusCode != http.StatusOK {
		return "", rawJSON, fmt.Errorf("Ollama API returned status %d: %s", resp.StatusCode, strings.TrimSpace(rawJSON))
	}

	var parsed struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", rawJSON, fmt.Errorf("parse Ollama response JSON: %w", err)
	}

	result := strings.TrimSpace(parsed.Response)
	if result == "" {
		return "", rawJSON, fmt.Errorf("Ollama response missing response field")
	}

	return result, rawJSON, nil
}
