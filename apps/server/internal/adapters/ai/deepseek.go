package ai

import (
	"context"
)

const (
	deepSeekDefaultBase = "https://api.deepseek.com/v1"
)

type DeepSeekProvider struct{}

func (p *DeepSeekProvider) ValidateConfig(s Settings) error {
	return validateOpenAICompatibleConfig(s, deepSeekProviderName, deepSeekDefaultBase)
}

func (p *DeepSeekProvider) Analyze(ctx context.Context, input string, s Settings) (string, string, error) {
	return analyzeOpenAICompatible(ctx, input, s, deepSeekProviderName, deepSeekDefaultBase)
}
