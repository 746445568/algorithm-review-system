package app

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	AppDir         string
	DataDir        string
	LogDir         string
	CacheDir       string
	ExportDir      string
	SecureDir      string
	DBPath         string
	ListenAddr     string
	MasterKeyPath  string
	ServiceToken   string
	AllowedOrigins []string
}

func LoadConfig() (Config, error) {
	base := os.Getenv("OJREVIEW_APP_DIR")
	if base == "" {
		root, err := os.UserConfigDir()
		if err != nil {
			return Config{}, err
		}
		base = filepath.Join(root, "OJReviewDesktop")
	}

	secureDir := filepath.Join(base, "secure")
	serviceToken, err := loadOrCreateServiceToken(secureDir)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		AppDir:         base,
		DataDir:        filepath.Join(base, "data"),
		LogDir:         filepath.Join(base, "logs"),
		CacheDir:       filepath.Join(base, "cache"),
		ExportDir:      filepath.Join(base, "exports"),
		SecureDir:      secureDir,
		DBPath:         filepath.Join(base, "data", "ojreview.db"),
		ListenAddr:     "127.0.0.1:38473",
		MasterKeyPath:  filepath.Join(base, "secure", "master.key"),
		ServiceToken:   serviceToken,
		AllowedOrigins: []string{"null", "http://localhost:5180", "http://127.0.0.1:5180"},
	}

	for _, dir := range []string{cfg.AppDir, cfg.DataDir, cfg.LogDir, cfg.CacheDir, cfg.ExportDir, cfg.SecureDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return Config{}, err
		}
	}

	return cfg, nil
}

func loadOrCreateServiceToken(secureDir string) (string, error) {
	if token := strings.TrimSpace(os.Getenv("OJREVIEW_SERVICE_TOKEN")); token != "" {
		return token, nil
	}
	if err := os.MkdirAll(secureDir, 0o700); err != nil {
		return "", fmt.Errorf("create secure directory: %w", err)
	}
	path := filepath.Join(secureDir, "service-auth.token")
	if body, err := os.ReadFile(path); err == nil {
		return strings.TrimSpace(string(body)), nil
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("read service token: %w", err)
	}

	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("generate service token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(random)
	if err := os.WriteFile(path, []byte(token+"\n"), 0o600); err != nil {
		return "", fmt.Errorf("write service token: %w", err)
	}
	return token, nil
}
