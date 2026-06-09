package ai

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	openAIProviderName      = "openai-compatible"
	openAIAliasProviderName = "openai"
	deepSeekProviderName    = "deepseek-compatible"
	deepSeekAliasProvider   = "deepseek"
	ollamaProviderName      = "ollama"

	analysisHTTPTimeout = 120 * time.Second
	completeHTTPTimeout = 300 * time.Second
)

var (
	// Shared HTTP clients — one per timeout tier — to avoid creating a new client per request.
	analysisClient = &http.Client{Timeout: analysisHTTPTimeout}
	completeClient = &http.Client{Timeout: completeHTTPTimeout}
)

func normalizeProviderName(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case openAIAliasProviderName, openAIProviderName:
		return openAIProviderName
	case deepSeekAliasProvider, deepSeekProviderName:
		return deepSeekProviderName
	default:
		return strings.ToLower(strings.TrimSpace(provider))
	}
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

func validateBaseURL(rawBaseURL string, defaultBase string) error {
	_, err := normalizeBaseURL(rawBaseURL, defaultBase)
	return err
}

func defaultBaseURL(rawBaseURL, defaultBase string) string {
	baseURL, err := normalizeBaseURL(rawBaseURL, defaultBase)
	if err != nil {
		return strings.TrimRight(defaultBase, "/")
	}
	return baseURL
}

func buildEndpoint(baseURL, path string) (string, error) {
	endpoint, err := url.JoinPath(strings.TrimRight(baseURL, "/"), strings.TrimPrefix(path, "/"))
	if err != nil {
		return "", fmt.Errorf("build endpoint URL: %w", err)
	}
	return endpoint, nil
}
