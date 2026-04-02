package app

import (
	"os"
	"path/filepath"
)

type Config struct {
	AppDir        string
	DataDir       string
	LogDir        string
	CacheDir      string
	ExportDir     string
	SecureDir     string
	DBPath        string
	ListenAddr    string
	MasterKeyPath string
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

	cfg := Config{
		AppDir:        base,
		DataDir:       filepath.Join(base, "data"),
		LogDir:        filepath.Join(base, "logs"),
		CacheDir:      filepath.Join(base, "cache"),
		ExportDir:     filepath.Join(base, "exports"),
		SecureDir:     filepath.Join(base, "secure"),
		DBPath:        filepath.Join(base, "data", "ojreview.db"),
		ListenAddr:    "0.0.0.0:38473",
		MasterKeyPath: filepath.Join(base, "secure", "master.key"),
	}

	for _, dir := range []string{cfg.AppDir, cfg.DataDir, cfg.LogDir, cfg.CacheDir, cfg.ExportDir, cfg.SecureDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return Config{}, err
		}
	}

	return cfg, nil
}
