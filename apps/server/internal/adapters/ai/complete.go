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

// Complete sends a single-turn completion request to the configured AI provider.
// It uses the OpenAI-compatible chat completions API for openai/deepseek providers,
// and the Ollama generate API for ollama.
// Returns the assistant text content, or an error.
func Complete(systemPrompt, userPrompt string, s Settings) (string, error) {
	provider := normalizeProviderName(s.Provider)
	switch provider {
	case openAIProviderName:
		return completeOpenAICompatible(systemPrompt, userPrompt, s, defaultOpenAIBaseURL)
	case deepSeekProviderName:
		return completeOpenAICompatible(systemPrompt, userPrompt, s, deepSeekDefaultBase)
	case ollamaProviderName:
		return completeOllama(systemPrompt, userPrompt, s)
	default:
		return "", fmt.Errorf("unsupported AI provider: %q", s.Provider)
	}
}

func completeOpenAICompatible(systemPrompt, userPrompt string, s Settings, defaultBase string) (string, error) {
	baseURL := defaultBaseURL(s.BaseURL, defaultBase)
	endpoint, err := buildEndpoint(baseURL, "/chat/completions")
	if err != nil {
		return "", err
	}

	messages := make([]map[string]string, 0, 2)
	if strings.TrimSpace(systemPrompt) != "" {
		messages = append(messages, map[string]string{"role": "system", "content": systemPrompt})
	}
	messages = append(messages, map[string]string{"role": "user", "content": userPrompt})

	payload := map[string]any{
		"model":       s.Model,
		"messages":    messages,
		"temperature": 0.7,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(s.APIKey))

	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("AI request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read AI response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("AI API returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("parse AI response JSON: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("AI response missing choices")
	}

	result := strings.TrimSpace(parsed.Choices[0].Message.Content)
	if result == "" {
		return "", fmt.Errorf("AI response contains empty content")
	}
	return result, nil
}

func completeOllama(systemPrompt, userPrompt string, s Settings) (string, error) {
	baseURL := defaultBaseURL(s.BaseURL, ollamaDefaultBase)
	endpoint, err := buildEndpoint(baseURL, "/api/generate")
	if err != nil {
		return "", err
	}

	prompt := userPrompt
	if strings.TrimSpace(systemPrompt) != "" {
		prompt = systemPrompt + "\n\n" + userPrompt
	}

	payload := map[string]any{
		"model":  s.Model,
		"prompt": prompt,
		"stream": false,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal Ollama request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create Ollama request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 300 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("Ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read Ollama response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Ollama API returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var parsed struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("parse Ollama response JSON: %w", err)
	}

	result := strings.TrimSpace(parsed.Response)
	if result == "" {
		return "", fmt.Errorf("Ollama response missing response field")
	}
	return result, nil
}
