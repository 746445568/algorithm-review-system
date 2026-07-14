package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const extensionPairingFile = "browser-extension.json"

type extensionPairingConfig struct {
	TokenHash string `json:"tokenHash"`
	Origin    string `json:"origin"`
}

func loadExtensionPairing(secureDir string) (string, string, error) {
	body, err := os.ReadFile(filepath.Join(secureDir, extensionPairingFile))
	if errors.Is(err, os.ErrNotExist) {
		return "", "", nil
	}
	if err != nil {
		return "", "", fmt.Errorf("read browser extension pairing: %w", err)
	}

	var pairing extensionPairingConfig
	if err := json.Unmarshal(body, &pairing); err != nil {
		return "", "", fmt.Errorf("decode browser extension pairing: %w", err)
	}
	if strings.TrimSpace(pairing.TokenHash) == "" || strings.TrimSpace(pairing.Origin) == "" {
		return "", "", errors.New("browser extension pairing is incomplete")
	}
	return strings.TrimSpace(pairing.TokenHash), strings.TrimSpace(pairing.Origin), nil
}

func SaveExtensionPairing(secureDir string, tokenHash string, origin string) error {
	if err := os.MkdirAll(secureDir, 0o700); err != nil {
		return fmt.Errorf("create secure directory: %w", err)
	}
	body, err := json.Marshal(extensionPairingConfig{
		TokenHash: strings.TrimSpace(tokenHash),
		Origin:    strings.TrimSpace(origin),
	})
	if err != nil {
		return fmt.Errorf("encode browser extension pairing: %w", err)
	}
	if err := os.WriteFile(filepath.Join(secureDir, extensionPairingFile), append(body, '\n'), 0o600); err != nil {
		return fmt.Errorf("write browser extension pairing: %w", err)
	}
	return nil
}
