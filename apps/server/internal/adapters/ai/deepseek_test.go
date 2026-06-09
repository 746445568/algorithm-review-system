package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDeepSeekAnalyzeStripsAnthropicPathFromOpenAICompatibleBaseURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			http.Error(w, "unexpected path: "+r.URL.Path, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer server.Close()

	provider := &DeepSeekProvider{}
	result, _, err := provider.Analyze(context.Background(), "{}", Settings{
		Provider: "deepseek",
		Model:    "deepseek-v4-pro",
		BaseURL:  server.URL + "/anthropic",
		APIKey:   "test-key",
	})
	if err != nil {
		t.Fatalf("Analyze should accept DeepSeek Anthropic baseUrl for OpenAI-compatible calls: %v", err)
	}
	if result != "ok" {
		t.Fatalf("Analyze result = %q, want %q", result, "ok")
	}
}

func TestDeepSeekCompleteStripsAnthropicPathFromOpenAICompatibleBaseURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			http.Error(w, "unexpected path: "+r.URL.Path, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer server.Close()

	result, err := Complete("system", "user", Settings{
		Provider: "deepseek",
		Model:    "deepseek-v4-pro",
		BaseURL:  server.URL + "/anthropic",
		APIKey:   "test-key",
	})
	if err != nil {
		t.Fatalf("Complete should accept DeepSeek Anthropic baseUrl for OpenAI-compatible calls: %v", err)
	}
	if result != "ok" {
		t.Fatalf("Complete result = %q, want %q", result, "ok")
	}
}
