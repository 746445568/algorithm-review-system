package ai

import "testing"

func TestOpenAIProviderValidateConfig(t *testing.T) {
	tests := []struct {
		name    string
		s       Settings
		wantErr bool
	}{
		{
			name: "valid openai alias",
			s: Settings{
				Provider: "openai",
				Model:    "gpt-4",
				APIKey:   "sk-test",
				BaseURL:  "https://api.openai.com/v1",
			},
			wantErr: false,
		},
		{
			name: "valid openai-compatible full name",
			s: Settings{
				Provider: "openai-compatible",
				Model:    "gpt-4",
				APIKey:   "sk-test",
				BaseURL:  "https://api.openai.com/v1",
			},
			wantErr: false,
		},
		{
			name: "missing model",
			s: Settings{
				Provider: "openai",
				APIKey:   "sk-test",
				BaseURL:  "https://api.openai.com/v1",
			},
			wantErr: true,
		},
		{
			name: "missing apiKey",
			s: Settings{
				Provider: "openai",
				Model:    "gpt-4",
				BaseURL:  "https://api.openai.com/v1",
			},
			wantErr: true,
		},
		{
			name: "invalid baseUrl",
			s: Settings{
				Provider: "openai",
				Model:    "gpt-4",
				APIKey:   "sk-test",
				BaseURL:  "not-a-url",
			},
			wantErr: true,
		},
		{
			name: "wrong provider",
			s: Settings{
				Provider: "deepseek",
				Model:    "gpt-4",
				APIKey:   "sk-test",
				BaseURL:  "https://api.openai.com/v1",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := &OpenAIProvider{}
			err := p.ValidateConfig(tt.s)
			if tt.wantErr && err == nil {
				t.Error("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Errorf("expected no error, got: %v", err)
			}
		})
	}
}
