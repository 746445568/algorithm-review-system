package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ExportDiagnostics exports diagnostic information to a JSON file
func (db *DB) ExportDiagnostics() (string, error) {
	diagPath := filepath.Join(db.cfg.ExportDir, fmt.Sprintf("diagnostics-%s.json", time.Now().UTC().Format("20060102-150405")))
	payload := map[string]any{
		"generatedAt": time.Now().UTC(),
		"schema":      schemaVersion,
		"dataDir":     db.cfg.DataDir,
		"logDir":      db.cfg.LogDir,
	}
	bytes, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(diagPath, bytes, 0o644); err != nil {
		return "", err
	}
	return diagPath, nil
}
