package ai

import "context"

type Settings struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	BaseURL  string `json:"baseUrl,omitempty"`
	APIKey   string `json:"apiKey,omitempty"`
}

type Provider interface {
	ValidateConfig(Settings) error
	Analyze(ctx context.Context, input string, settings Settings) (string, string, error)
}
