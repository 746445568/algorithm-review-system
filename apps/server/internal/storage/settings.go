package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"ojreviewdesktop/internal/models"
)

// SaveAISettings saves AI provider settings
func (db *DB) SaveAISettings(settings models.AISettings) error {
	apiKeyCipher := ""
	if settings.APIKey != "" {
		encrypted, err := db.vault.Encrypt(settings.APIKey)
		if err != nil {
			return err
		}
		apiKeyCipher = encrypted
	}
	payload := map[string]string{
		"provider": settings.Provider,
		"model":    settings.Model,
		"baseUrl":  settings.BaseURL,
		"apiKey":   apiKeyCipher,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = db.conn.Exec(`
INSERT INTO app_settings(key, value) VALUES ('ai_settings', ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, string(body))
	return err
}

// LoadAISettings loads AI provider settings
func (db *DB) LoadAISettings() (models.AISettings, error) {
	row := db.conn.QueryRow(`SELECT value FROM app_settings WHERE key = 'ai_settings'`)
	var raw string
	if err := row.Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.AISettings{}, nil
		}
		return models.AISettings{}, err
	}
	var payload map[string]string
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return models.AISettings{}, err
	}
	apiKey := ""
	if payload["apiKey"] != "" {
		decrypted, err := db.vault.Decrypt(payload["apiKey"])
		if err != nil {
			return models.AISettings{}, err
		}
		apiKey = decrypted
	}
	return models.AISettings{
		Provider: payload["provider"],
		Model:    payload["model"],
		BaseURL:  payload["baseUrl"],
		APIKey:   apiKey,
	}, nil
}

// SaveThemeMode saves the theme mode setting
func (db *DB) SaveThemeMode(mode string) error {
	mode = strings.TrimSpace(strings.ToLower(mode))
	if mode == "" {
		mode = "follow-system"
	}
	_, err := db.conn.Exec(`
INSERT INTO app_settings(key, value) VALUES ('theme_mode', ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, mode)
	return err
}

// LoadThemeMode loads the theme mode setting
func (db *DB) LoadThemeMode() (string, error) {
	row := db.conn.QueryRow(`SELECT value FROM app_settings WHERE key = 'theme_mode'`)
	var mode string
	if err := row.Scan(&mode); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "follow-system", nil
		}
		return "", err
	}
	mode = strings.TrimSpace(strings.ToLower(mode))
	if mode == "" {
		mode = "follow-system"
	}
	return mode, nil
}
