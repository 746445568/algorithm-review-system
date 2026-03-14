package ai

import "fmt"

func NewProvider(providerType string) (Provider, error) {
	switch normalizeProviderName(providerType) {
	case openAIProviderName:
		return &OpenAIProvider{}, nil
	case deepSeekProviderName:
		return &DeepSeekProvider{}, nil
	case ollamaProviderName:
		return &OllamaProvider{}, nil
	default:
		return nil, fmt.Errorf("unsupported AI provider: %q", providerType)
	}
}
